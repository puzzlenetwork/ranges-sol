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

import "@balancer-labs/v2-interfaces/contracts/vault/IVault.sol";
import "@balancer-labs/v2-interfaces/contracts/vault/IBasePool.sol";
import "@balancer-labs/v2-interfaces/contracts/pool-range/IRangePool.sol";
import "@balancer-labs/v2-solidity-utils/contracts/math/FixedPoint.sol";
import "@balancer-labs/v2-solidity-utils/contracts/math/Math.sol";
import "@balancer-labs/v2-solidity-utils/contracts/helpers/InputHelpers.sol";
import "@balancer-labs/v2-solidity-utils/contracts/helpers/ScalingHelpers.sol";

import "./RangeMath.sol";

/**
 * @title RangePoolQueries
 * @notice Contract for querying Range Pool swap calculations without state changes
 * @dev This contract provides read-only functions to calculate swap amounts for Range Pools
 */
contract RangePoolQueries {
    using FixedPoint for uint256;
    using Math for uint256;

    IVault private immutable _vault;

    constructor(IVault vault) {
        _vault = vault;
    }

    /**
     * @notice Calculate the amount of tokens that will be received for a given input amount
     * @param poolAddress The address of the Range Pool
     * @param amountIn The amount of tokens being swapped in
     * @param assetIn The address of the input token
     * @param assetOut The address of the output token
     * @return amountOut The amount of tokens that will be received
     */
    function getAmountOut(
        address poolAddress,
        uint256 amountIn,
        address assetIn,
        address assetOut
    ) external view returns (uint256) {
        // Validate pool first
        _validatePool(poolAddress);
        
        IRangePool pool = IRangePool(poolAddress);
        
        // Get pool data
        (, uint256[] memory balances,) = _vault.getPoolTokens(pool.getPoolId());
        uint256[] memory scalingFactors = pool.getScalingFactors();
        
        // Find token indexes
        IERC20[] memory tokens = _getPoolTokens(pool);
        uint256 indexIn = _getTokenIndex(tokens, assetIn);
        uint256 indexOut = _getTokenIndex(tokens, assetOut);
        
        // Get pool data
        uint256 swapFeePercentage = pool.getSwapFeePercentage();
        uint256 amountInAfterFees = _subtractSwapFeeAmount(amountIn, swapFeePercentage);
        
        // Scale amounts
        uint256 scaledAmountIn = _upscale(amountInAfterFees, scalingFactors[indexIn]);
        uint256 scaledBalanceOut = _upscale(balances[indexOut], scalingFactors[indexOut]);
        
        // Calculate amount out using RangeMath directly
        uint256 scaledAmountOut = _calculateAmountOut(
            pool,
            assetIn,
            assetOut,
            scaledAmountIn,
            scaledBalanceOut
        );
        
        // Scale down the result
        return _downscaleDown(scaledAmountOut, scalingFactors[indexOut]);
    }

    /**
     * @notice Calculate the amount of tokens needed as input for a desired output amount
     * @param poolAddress The address of the Range Pool
     * @param amountOut The desired amount of tokens to receive
     * @param assetIn The address of the input token
     * @param assetOut The address of the output token
     * @return amountIn The amount of tokens needed as input
     */
    function getAmountIn(
        address poolAddress,
        uint256 amountOut,
        address assetIn,
        address assetOut
    ) external view returns (uint256) {
        IRangePool pool = IRangePool(poolAddress);
        
        // Get pool data
        uint256[] memory scalingFactors = pool.getScalingFactors();
        
        // Find token indexes
        IERC20[] memory tokens = _getPoolTokens(pool);
        uint256 indexIn = _getTokenIndex(tokens, assetIn);
        uint256 indexOut = _getTokenIndex(tokens, assetOut);
        
        // Get swap fee percentage
        uint256 swapFeePercentage = pool.getSwapFeePercentage();
        
        // Scale amounts
        uint256 scaledAmountOut = _upscale(amountOut, scalingFactors[indexOut]);
        
        // Calculate amount in using RangeMath directly
        uint256 scaledAmountIn = _calculateAmountIn(
            pool,
            assetIn,
            assetOut,
            scaledAmountOut
        );
        
        // Scale down the result
        uint256 amountInAfterFees = _downscaleUp(scaledAmountIn, scalingFactors[indexIn]);
        
        // Add fees back
        return _addSwapFeeAmount(amountInAfterFees, swapFeePercentage);
    }

    /**
     * @notice Get comprehensive swap information for a given input amount
     * @param poolAddress The address of the Range Pool
     * @param amountIn The amount of tokens being swapped in
     * @param assetIn The address of the input token
     * @param assetOut The address of the output token
     * @return amountOut Amount of tokens out
     * @return amountInAfterFees Amount in after fees
     * @return feeAmount Fee amount
     * @return virtualBalanceIn Virtual balance of input token
     * @return virtualBalanceOut Virtual balance of output token
     * @return weightIn Weight of input token
     * @return weightOut Weight of output token
     */
    function getSwapInfo(
        address poolAddress,
        uint256 amountIn,
        address assetIn,
        address assetOut
    ) external view returns (
        uint256 amountOut,
        uint256 amountInAfterFees,
        uint256 feeAmount,
        uint256 virtualBalanceIn,
        uint256 virtualBalanceOut,
        uint256 weightIn,
        uint256 weightOut,
        uint256 swapFeePercentage
    ) {
        IRangePool pool = IRangePool(poolAddress);
        
        // Get basic pool data
        swapFeePercentage = pool.getSwapFeePercentage();
        
        // Get virtual balances and normalized weights for specific tokens
        (virtualBalanceIn, virtualBalanceOut, weightIn, weightOut) = _getPoolTokenData(pool, assetIn, assetOut);
        
        // Calculate fees
        feeAmount = amountIn.mulDown(swapFeePercentage);
        amountInAfterFees = amountIn - feeAmount;
        
        // Get amount out
        amountOut = this.getAmountOut(poolAddress, amountIn, assetIn, assetOut);
    }

    // ============ Public Math Functions (from ExternalRangeMath) ============

    /**
     * @notice Calculate amount out given amount in
     * @param virtualBalanceIn Virtual balance of input token
     * @param weightIn Weight of input token
     * @param virtualBalanceOut Virtual balance of output token
     * @param weightOut Weight of output token
     * @param amountIn Amount of input tokens
     * @param factBalance Factual balance
     * @return amountOut Amount of output tokens
     */
    function calcOutGivenIn(
        uint256 virtualBalanceIn,
        uint256 weightIn,
        uint256 virtualBalanceOut,
        uint256 weightOut,
        uint256 amountIn,
        uint256 factBalance
    ) public pure returns (uint256) {
        return RangeMath._calcOutGivenIn(virtualBalanceIn, weightIn, virtualBalanceOut, weightOut, amountIn, factBalance);
    }

    /**
     * @notice Calculate amount in given amount out
     * @param virtualBalanceIn Virtual balance of input token
     * @param weightIn Weight of input token
     * @param virtualBalanceOut Virtual balance of output token
     * @param weightOut Weight of output token
     * @param amountOut Amount of output tokens
     * @return amountIn Amount of input tokens
     */
    function calcInGivenOut(
        uint256 virtualBalanceIn,
        uint256 weightIn,
        uint256 virtualBalanceOut,
        uint256 weightOut,
        uint256 amountOut
    ) public pure returns (uint256) {
        return RangeMath._calcInGivenOut(virtualBalanceIn, weightIn, virtualBalanceOut, weightOut, amountOut);
    }

    /**
     * @notice Calculate BPT out given exact tokens in
     * @param factBalances Factual balances
     * @param amountsIn Amounts in
     * @param bptTotalSupply Total BPT supply
     * @return bptOut BPT amount out
     */
    function calcBptOutGivenExactTokensIn(
        uint256[] memory factBalances,
        uint256[] memory amountsIn,
        uint256 bptTotalSupply
    ) public pure returns (uint256) {
        return RangeMath._calcBptOutGivenExactTokensIn(factBalances, amountsIn, bptTotalSupply);
    }

    /**
     * @notice Calculate BPT in given exact tokens out
     * @param factBalances Factual balances
     * @param amountsOut Amounts out
     * @param bptTotalSupply Total BPT supply
     * @return bptIn BPT amount in
     */
    function calcBptInGivenExactTokensOut(
        uint256[] memory factBalances,
        uint256[] memory amountsOut,
        uint256 bptTotalSupply
    ) public pure returns (uint256) {
        return RangeMath._calcBptInGivenExactTokensOut(factBalances, amountsOut, bptTotalSupply);
    }

    /**
     * @notice Calculate minimum ratio
     * @param factBalances Factual balances
     * @param amounts Amounts
     * @return ratioMin Minimum ratio
     */
    function calcRatioMin(
        uint256[] memory factBalances,
        uint256[] memory amounts
    ) public pure returns (uint256) {
        return RangeMath._calcRatioMin(factBalances, amounts);
    }

    // ============ Internal Functions ============

    function _getPoolTokens(IRangePool pool) internal view returns (IERC20[] memory) {
        (IERC20[] memory tokens,,) = _vault.getPoolTokens(pool.getPoolId());
        return tokens;
    }

    function _getPoolTokenData(
        IRangePool pool,
        address assetIn,
        address assetOut
    ) internal view returns (
        uint256 virtualBalanceIn,
        uint256 virtualBalanceOut,
        uint256 weightIn,
        uint256 weightOut
    ) {
        uint256[] memory virtualBalances = pool.getVirtualBalances();
        uint256[] memory normalizedWeights = pool.getNormalizedWeights();
        
        // Get token indexes
        IERC20[] memory tokens = _getPoolTokens(pool);
        uint256 indexIn = _getTokenIndex(tokens, assetIn);
        uint256 indexOut = _getTokenIndex(tokens, assetOut);
        
        virtualBalanceIn = virtualBalances[indexIn];
        virtualBalanceOut = virtualBalances[indexOut];
        weightIn = normalizedWeights[indexIn];
        weightOut = normalizedWeights[indexOut];
    }

    function _getTokenIndex(IERC20[] memory tokens, address token) internal pure returns (uint256) {
        for (uint256 i = 0; i < tokens.length; i++) {
            if (address(tokens[i]) == token) {
                return i;
            }
        }
        revert("TOKEN_NOT_FOUND");
    }

    function _validatePool(address poolAddress) internal view {
        IRangePool pool = IRangePool(poolAddress);
        
        // Check if pool has required methods
        try pool.getPoolId() returns (bytes32) {
            // Pool has poolId
        } catch {
            revert("INVALID_POOL");
        }
        
        try pool.getScalingFactors() returns (uint256[] memory) {
            // Pool has scaling factors
        } catch {
            revert("POOL_NO_SCALING_FACTORS");
        }
    }


    function _subtractSwapFeeAmount(uint256 amount, uint256 swapFeePercentage) internal pure returns (uint256) {
        // This rounds down, which is the desired behavior
        uint256 feeAmount = amount.mulDown(swapFeePercentage);
        return amount - feeAmount;
    }

    function _addSwapFeeAmount(uint256 amount, uint256 swapFeePercentage) internal pure returns (uint256) {
        // This rounds up, which is the desired behavior
        uint256 feeAmount = amount.mulUp(swapFeePercentage);
        return amount + feeAmount;
    }

    function _upscale(uint256 amount, uint256 scalingFactor) internal pure returns (uint256) {
        return FixedPoint.mulDown(amount, scalingFactor);
    }

    function _downscaleDown(uint256 amount, uint256 scalingFactor) internal pure returns (uint256) {
        return FixedPoint.divDown(amount, scalingFactor);
    }

    function _downscaleUp(uint256 amount, uint256 scalingFactor) internal pure returns (uint256) {
        return FixedPoint.divUp(amount, scalingFactor);
    }

    function _calculateAmountOut(
        IRangePool pool,
        address assetIn,
        address assetOut,
        uint256 scaledAmountIn,
        uint256 scaledBalanceOut
    ) internal view returns (uint256) {
        uint256[] memory virtualBalances = pool.getVirtualBalances();
        uint256[] memory normalizedWeights = pool.getNormalizedWeights();
        
        // Get token indexes
        IERC20[] memory tokens = _getPoolTokens(pool);
        uint256 indexIn = _getTokenIndex(tokens, assetIn);
        uint256 indexOut = _getTokenIndex(tokens, assetOut);
        
        return RangeMath._calcOutGivenIn(
            virtualBalances[indexIn],
            normalizedWeights[indexIn],
            virtualBalances[indexOut],
            normalizedWeights[indexOut],
            scaledAmountIn,
            scaledBalanceOut
        );
    }

    function _calculateAmountIn(
        IRangePool pool,
        address assetIn,
        address assetOut,
        uint256 scaledAmountOut
    ) internal view returns (uint256) {
        uint256[] memory virtualBalances = pool.getVirtualBalances();
        uint256[] memory normalizedWeights = pool.getNormalizedWeights();
        
        // Get token indexes from vault
        IERC20[] memory tokens = _getPoolTokens(pool);
        
        uint256 indexIn = _getTokenIndex(tokens, assetIn);
        uint256 indexOut = _getTokenIndex(tokens, assetOut);
        
        return RangeMath._calcInGivenOut(
            virtualBalances[indexIn],
            normalizedWeights[indexIn],
            virtualBalances[indexOut],
            normalizedWeights[indexOut],
            scaledAmountOut
        );
    }
}
