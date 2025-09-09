// SPDX-License-Identifier: GPL-3.0-or-later
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.

// You should have received a copy of the GNU General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

pragma solidity ^0.7.0;
pragma experimental ABIEncoderV2;

import "@balancer-labs/v2-interfaces/contracts/pool-weighted/WeightedPoolUserData.sol";
import "@balancer-labs/v2-interfaces/contracts/pool-range/RangePoolUserData.sol";

import "@balancer-labs/v2-solidity-utils/contracts/math/FixedPoint.sol";
import "@balancer-labs/v2-solidity-utils/contracts/helpers/InputHelpers.sol";

import "@balancer-labs/v2-pool-utils/contracts/BaseGeneralPool.sol";
import "@balancer-labs/v2-pool-utils/contracts/lib/BasePoolMath.sol";
import "@balancer-labs/v2-pool-weighted/contracts/WeightedMath.sol";

import "./RangeMath.sol";

/**
 * @dev Base class for RangePools containing swap, join and exit logic, but leaving storage and management of
 * the weights to subclasses. Derived contracts can choose to make weights immutable, mutable, or even dynamic
 *  based on local or external logic.
 */
abstract contract BaseRangePool is BaseGeneralPool {
    using FixedPoint for uint256;
    using BasePoolUserData for bytes;
    using WeightedPoolUserData for bytes;
    using RangePoolUserData for bytes;

    constructor(
        IVault vault,
        string memory name,
        string memory symbol,
        IERC20[] memory tokens,
        address[] memory assetManagers,
        uint256 swapFeePercentage,
        uint256 pauseWindowDuration,
        uint256 bufferPeriodDuration,
        address owner,
        bool mutableTokens
    )
        BasePool(
            vault,
            IVault.PoolSpecialization.GENERAL,
            name,
            symbol,
            tokens,
            assetManagers,
            swapFeePercentage,
            pauseWindowDuration,
            bufferPeriodDuration,
            owner
        )
    {
        // solhint-disable-previous-line no-empty-blocks
    }

    // Virtual functions

    /**
     * @dev Returns the index of `token`.
     */
    function _getTokenIndex(IERC20 token) internal view virtual returns (uint256);

    /**
     * @dev Returns the normalized weight of `token`. Weights are fixed point numbers that sum to FixedPoint.ONE.
     */
    function _getNormalizedWeight(IERC20 token) internal view virtual returns (uint256);

    /**
     * @dev Returns all normalized weights, in the same order as the Pool's tokens.
     */
    function _getNormalizedWeights() internal view virtual returns (uint256[] memory);

    /**
     * @dev Returns the virtual balance of `token`.
     */
    function _getVirtualBalances() internal view virtual returns (uint256[] memory);

    /**
     * @dev Returns the virtual balance of `token`.
     */
    function _getVirtualBalance(IERC20 token) internal view virtual returns (uint256);

    /**
     * @dev Sets the virtual balances of `initialization`.
     */
    function _setVirtualBalances(uint256[] memory deltas) internal virtual;

    /**
     * @dev Changes the virtual balance of `token`.
     */
    function _changeVirtualBalance(IERC20 token, uint256 delta, bool increase) internal virtual;

    /**
     * @dev Changes the virtual balances of `join` by ratioMin.
     */
    function _changeVirtualBalancesBy(uint256 ratioMin, bool increase) internal virtual;

    /**
     * @dev Returns the current value of the invariant.
     * **IMPORTANT NOTE**: calling this function within a Vault context (i.e. in the middle of a join or an exit) is
     * potentially unsafe, since the returned value is manipulable. It is up to the caller to ensure safety.
     *
     * Calculating the invariant requires the state of the pool to be in sync with the state of the Vault.
     * That condition may not be true in the middle of a join or an exit.
     *
     * To call this function safely, attempt to trigger the reentrancy guard in the Vault by calling a non-reentrant
     * function before calling `getInvariant`. That will make the transaction revert in an unsafe context.
     * (See `VaultReentrancyLib.ensureNotInVaultContext` in pool-utils.)
     *
     * See https://forum.balancer.fi/t/reentrancy-vulnerability-scope-expanded/4345 for reference.
     */
    function getInvariant() public view returns (uint256) {
        (, uint256[] memory balances, ) = getVault().getPoolTokens(getPoolId());

        // Since the Pool hooks always work with upscaled balances, we manually
        // upscale here for consistency
        _upscaleArray(balances, _scalingFactors());

        uint256[] memory normalizedWeights = _getNormalizedWeights();
        return WeightedMath._calculateInvariant(normalizedWeights, balances);
    }

    function getNormalizedWeights() external view returns (uint256[] memory) {
        return _getNormalizedWeights();
    }

    function getVirtualBalances() external view returns (uint256[] memory) {
        return _getVirtualBalances();
    }

    // Base Pool handlers

    // Swap

    function _onSwapGivenIn(
        SwapRequest memory swapRequest,
        uint256[] memory balances,
        uint256 /*indexIn*/,
        uint256 /*indexOut*/
    ) internal virtual override returns (uint256) {
        uint256 tokenOutIdx = _getTokenIndex(swapRequest.tokenOut);
        _require(tokenOutIdx < balances.length, Errors.OUT_OF_BOUNDS);
        uint256 amountOut = RangeMath._calcOutGivenIn(
                _getVirtualBalance(swapRequest.tokenIn),
                _getNormalizedWeight(swapRequest.tokenIn),
                _getVirtualBalance(swapRequest.tokenOut),
                _getNormalizedWeight(swapRequest.tokenOut),
                swapRequest.amount,
                balances[tokenOutIdx]
            );

        _changeVirtualBalance(swapRequest.tokenIn, swapRequest.amount, true);
        _changeVirtualBalance(swapRequest.tokenOut, amountOut, false);
        return amountOut;
    }

    function _onSwapGivenOut(
        SwapRequest memory swapRequest,
        uint256[] memory balances,
        uint256 /*indexIn*/,
        uint256 /*indexOut*/
    ) internal virtual override returns (uint256) {
        uint256 tokenOutIdx = _getTokenIndex(swapRequest.tokenOut);
        _require(tokenOutIdx < balances.length, Errors.OUT_OF_BOUNDS);
        _require(balances[tokenOutIdx] >= swapRequest.amount, Errors.INSUFFICIENT_BALANCE);
        uint256 amountIn =
            RangeMath._calcInGivenOut(
                _getVirtualBalance(swapRequest.tokenIn),
                _getNormalizedWeight(swapRequest.tokenIn),
                _getVirtualBalance(swapRequest.tokenOut),
                _getNormalizedWeight(swapRequest.tokenOut),
                swapRequest.amount
            );

        _changeVirtualBalance(swapRequest.tokenIn, amountIn, true);
        _changeVirtualBalance(swapRequest.tokenOut, swapRequest.amount, false);
        return amountIn;
    }

    /**
     * @dev Called before any join or exit operation. Returns the Pool's total supply by default, but derived contracts
     * may choose to add custom behavior at these steps. This often has to do with protocol fee processing.
     */
    function _beforeJoinExit(uint256[] memory preBalances, uint256[] memory normalizedWeights)
        internal
        virtual
        returns (uint256, uint256)
    {
        return (totalSupply(), WeightedMath._calculateInvariant(normalizedWeights, preBalances));
    }

    /**
     * @dev Called after any regular join or exit operation. Empty by default, but derived contracts
     * may choose to add custom behavior at these steps. This often has to do with protocol fee processing.
     *
     * If performing a join operation, balanceDeltas are the amounts in: otherwise they are the amounts out.
     *
     * This function is free to mutate the `preBalances` array.
     */
    function _afterJoinExit(
        uint256 preJoinExitInvariant,
        uint256[] memory preBalances,
        uint256[] memory balanceDeltas,
        uint256[] memory normalizedWeights,
        uint256 preJoinExitSupply,
        uint256 postJoinExitSupply
    ) internal virtual {
        // solhint-disable-previous-line no-empty-blocks
    }

    // Derived contracts may call this to update state after a join or exit.
    function _updatePostJoinExit(uint256 postJoinExitInvariant) internal virtual {
        // solhint-disable-previous-line no-empty-blocks
    }

    // Initialize

    function _onInitializePool(
        bytes32,
        address,
        address,
        uint256[] memory scalingFactors,
        bytes memory userData
    ) internal virtual override returns (uint256, uint256[] memory) {
        WeightedPoolUserData.JoinKind kind = userData.joinKind();
        _require(kind == WeightedPoolUserData.JoinKind.INIT, Errors.UNINITIALIZED);

        uint256[] memory amountsIn = userData.initialAmountsIn();
        uint256[] memory virtualBalances = userData.initialVirtualBalances();
        InputHelpers.ensureInputLengthMatch(amountsIn.length, scalingFactors.length);
        InputHelpers.ensureInputLengthMatch(amountsIn.length, virtualBalances.length);
        _upscaleArray(amountsIn, scalingFactors);

        uint256[] memory normalizedWeights = _getNormalizedWeights();
        uint256 invariantAfterJoin = WeightedMath._calculateInvariant(normalizedWeights, amountsIn);

        // Set the initial BPT to the value of the invariant times the number of tokens. This makes BPT supply more
        // consistent in Pools with similar compositions but different number of tokens.
        uint256 bptAmountOut = Math.mul(invariantAfterJoin, amountsIn.length);

        // Initialization is still a join, so we need to do post-join work. Since we are not paying protocol fees,
        // and all we need to do is update the invariant, call `_updatePostJoinExit` here instead of `_afterJoinExit`.
        _setVirtualBalances(virtualBalances);
     
        _updatePostJoinExit(invariantAfterJoin);

        return (bptAmountOut, amountsIn);
    }

    // Join

    function _onJoinPool(
        bytes32,
        address sender,
        address,
        uint256[] memory balances,
        uint256,
        uint256,
        uint256[] memory scalingFactors,
        bytes memory userData
    ) internal virtual override returns (uint256, uint256[] memory) {
        uint256[] memory normalizedWeights = _getNormalizedWeights();

        (uint256 preJoinExitSupply, uint256 preJoinExitInvariant) = _beforeJoinExit(balances, normalizedWeights);

        (uint256 bptAmountOut, uint256[] memory amountsIn) = _doJoin(
            sender,
            balances,
            normalizedWeights,
            scalingFactors,
            preJoinExitSupply,
            userData
        );

        uint256 minRatio =  bptAmountOut.mulUp(FixedPoint.ONE).divDown(preJoinExitSupply);
        _changeVirtualBalancesBy(minRatio, true);

        _afterJoinExit(
            preJoinExitInvariant,
            balances,
            amountsIn,
            normalizedWeights,
            preJoinExitSupply,
            preJoinExitSupply.add(bptAmountOut)
        );

        return (bptAmountOut, amountsIn);
    }

    /**
     * @dev Dispatch code which decodes the provided userdata to perform the specified join type.
     * Inheriting contracts may override this function to add additional join types or extra conditions to allow
     * or disallow joins under certain circumstances.
     */
    function _doJoin(
        address,
        uint256[] memory balances,
        uint256[] memory /*normalizedWeights*/,
        uint256[] memory scalingFactors,
        uint256 totalSupply,
        bytes memory userData
    ) internal view virtual returns (uint256, uint256[] memory) {
        WeightedPoolUserData.JoinKind kind = userData.joinKind();

        if (kind == WeightedPoolUserData.JoinKind.EXACT_TOKENS_IN_FOR_BPT_OUT) {
            return _joinExactTokensInForBPTOut(balances, scalingFactors, totalSupply, userData);
        } else if (kind == WeightedPoolUserData.JoinKind.ALL_TOKENS_IN_FOR_EXACT_BPT_OUT) {
            return _joinAllTokensInForExactBPTOut(balances, totalSupply, userData);
        } else {
            _revert(Errors.UNHANDLED_JOIN_KIND);
        }
    }

    function _joinExactTokensInForBPTOut(
        uint256[] memory balances,
        uint256[] memory scalingFactors,
        uint256 totalSupply,
        bytes memory userData
    ) private pure returns (uint256, uint256[] memory) {
        (uint256[] memory amountsIn, uint256 minBPTAmountOut) = userData.exactTokensInForBptOut();
        InputHelpers.ensureInputLengthMatch(balances.length, amountsIn.length);

        _upscaleArray(amountsIn, scalingFactors);

        uint256 bptAmountOut = RangeMath._calcBptOutGivenExactTokensIn(
            balances,
            amountsIn,
            totalSupply
        );

        _require(bptAmountOut >= minBPTAmountOut, Errors.BPT_OUT_MIN_AMOUNT);

        return (bptAmountOut, amountsIn);
    }

    function _joinAllTokensInForExactBPTOut(
        uint256[] memory balances,
        uint256 totalSupply,
        bytes memory userData
    ) private pure returns (uint256, uint256[] memory) {
        uint256 bptAmountOut = userData.allTokensInForExactBptOut();
        // Note that there is no maximum amountsIn parameter: this is handled by `IVault.joinPool`.

        uint256[] memory amountsIn = BasePoolMath.computeProportionalAmountsIn(balances, totalSupply, bptAmountOut);

        return (bptAmountOut, amountsIn);
    }

    // Exit

    function _onExitPool(
        bytes32,
        address sender,
        address,
        uint256[] memory balances,
        uint256,
        uint256,
        uint256[] memory scalingFactors,
        bytes memory userData
    ) internal virtual override returns (uint256, uint256[] memory) {
        uint256[] memory normalizedWeights = _getNormalizedWeights();

        (uint256 preJoinExitSupply, uint256 preJoinExitInvariant) = _beforeJoinExit(balances, normalizedWeights);

        (uint256 bptAmountIn, uint256[] memory amountsOut) = _doExit(
            sender,
            balances,
            normalizedWeights,
            scalingFactors,
            preJoinExitSupply,
            userData
        );

        uint256 minRatio = bptAmountIn.mulUp(FixedPoint.ONE).divDown(preJoinExitSupply);
        _changeVirtualBalancesBy(minRatio, false);

        _afterJoinExit(
            preJoinExitInvariant,
            balances,
            amountsOut,
            normalizedWeights,
            preJoinExitSupply,
            preJoinExitSupply.sub(bptAmountIn)
        );

        return (bptAmountIn, amountsOut);
    }

    /**
     * @dev Dispatch code which decodes the provided userdata to perform the specified exit type.
     * Inheriting contracts may override this function to add additional exit types or extra conditions to allow
     * or disallow exit under certain circumstances.
     */
    function _doExit(
        address,
        uint256[] memory balances,
        uint256[] memory /*normalizedWeights*/,
        uint256[] memory scalingFactors,
        uint256 totalSupply,
        bytes memory userData
    ) internal view virtual returns (uint256, uint256[] memory) {
        WeightedPoolUserData.ExitKind kind = userData.exitKind();

        if (kind == WeightedPoolUserData.ExitKind.EXACT_BPT_IN_FOR_TOKENS_OUT) {
            return _exitExactBPTInForTokensOut(balances, totalSupply, userData);
        } else if (kind == WeightedPoolUserData.ExitKind.BPT_IN_FOR_EXACT_TOKENS_OUT) {
            return _exitBPTInForExactTokensOut(balances, scalingFactors, totalSupply, userData);
        } else {
            _revert(Errors.UNHANDLED_EXIT_KIND);
        }
    }

    function _exitExactBPTInForTokensOut(
        uint256[] memory balances,
        uint256 totalSupply,
        bytes memory userData
    ) private pure returns (uint256, uint256[] memory) {
        uint256 bptAmountIn = userData.exactBptInForTokensOut();
        // Note that there is no minimum amountOut parameter: this is handled by `IVault.exitPool`.

        uint256[] memory amountsOut = BasePoolMath.computeProportionalAmountsOut(balances, totalSupply, bptAmountIn);
        return (bptAmountIn, amountsOut);
    }

    function _exitBPTInForExactTokensOut(
        uint256[] memory balances,
        uint256[] memory scalingFactors,
        uint256 totalSupply,
        bytes memory userData
    ) private pure returns (uint256, uint256[] memory) {
        (uint256[] memory amountsOut, uint256 maxBPTAmountIn) = userData.bptInForExactTokensOut();
        InputHelpers.ensureInputLengthMatch(amountsOut.length, balances.length);
        _upscaleArray(amountsOut, scalingFactors);

        // This is an exceptional situation in which the fee is charged on a token out instead of a token in.
        uint256 bptAmountIn = RangeMath._calcBptInGivenExactTokensOut(
            balances,
            amountsOut,
            totalSupply
        );
        _require(bptAmountIn <= maxBPTAmountIn, Errors.BPT_IN_MAX_AMOUNT);

        return (bptAmountIn, amountsOut);
    }

    // Recovery Mode

    function _doRecoveryModeExit(
        uint256[] memory balances,
        uint256 totalSupply,
        bytes memory userData
    ) internal pure override returns (uint256 bptAmountIn, uint256[] memory amountsOut) {
        bptAmountIn = userData.recoveryModeExit();
        amountsOut = BasePoolMath.computeProportionalAmountsOut(balances, totalSupply, bptAmountIn);
    }
}
