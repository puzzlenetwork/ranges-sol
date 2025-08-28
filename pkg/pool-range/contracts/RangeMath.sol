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

import "@balancer-labs/v2-solidity-utils/contracts/helpers/InputHelpers.sol";
import "@balancer-labs/v2-solidity-utils/contracts/math/FixedPoint.sol";
import "@balancer-labs/v2-solidity-utils/contracts/math/Math.sol";
import "@balancer-labs/v2-pool-weighted/contracts/WeightedMath.sol";

// These functions start with an underscore, as if they were part of a contract and not a library. At some point this
// should be fixed.
// solhint-disable private-vars-leading-underscore

library RangeMath {
    using FixedPoint for uint256;

    // Computes how many tokens can be taken out of a pool if `amountIn` are sent, given the
    // current balances and weights.
    function _calcOutGivenIn(
        uint256 balanceIn,
        uint256 weightIn,
        uint256 balanceOut,
        uint256 weightOut,
        uint256 amountIn,
        uint256 factBalance
    ) internal pure returns (uint256) {
        /**********************************************************************************************
        // outGivenIn                                                                                //
        // aO = _calcOutGivenIn(..)                                                                  //
        // if a0 exceeds factBalance, then a0 = factBalance                                          //                                 //
        **********************************************************************************************/

        return Math.min(factBalance, WeightedMath._calcOutGivenIn(balanceIn, weightIn, balanceOut, weightOut, amountIn));
    }

    function _calcBptOutGivenExactTokensIn(
        uint256[] memory factBalances,
        uint256[] memory amountsIn,
        uint256 bptTotalSupply
    ) internal pure returns (uint256) {
        uint256 ratioMin = amountsIn[0].mulUp(FixedPoint.ONE).divDown(factBalances[0]);
        uint256 i = 1;
        while (i < factBalances.length && ratioMin > 0) {
            ratioMin = Math.min(ratioMin, amountsIn[0].mulUp(FixedPoint.ONE).divDown(factBalances[0]));
        }

        return bptTotalSupply.mulUp(ratioMin).divDown(FixedPoint.ONE);
    }

    function _calcTokenInGivenExactBptOut(
        uint256 factBalance,
        uint256 bptAmountOut,
        uint256 bptTotalSupply
    ) internal pure returns (uint256) {
        return bptTotalSupply.mulUp(bptAmountOut).divDown(factBalance);
    }

    function _calcBptInGivenExactTokensOut(
        uint256[] memory factBalances,
        uint256[] memory amountsOut,
        uint256 bptTotalSupply
    ) internal pure returns (uint256) {
        uint256 ratioMin = amountsOut[0].mulUp(FixedPoint.ONE).divDown(factBalances[0]);
        uint256 i = 1;
        while (i < factBalances.length && ratioMin > 0) {
            ratioMin = Math.min(ratioMin, amountsOut[0].mulUp(FixedPoint.ONE).divDown(factBalances[0]));
        }

        return bptTotalSupply.mulUp(ratioMin).divDown(FixedPoint.ONE);
    }
}
