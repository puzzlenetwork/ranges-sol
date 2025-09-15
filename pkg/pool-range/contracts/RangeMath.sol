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

import "@balancer-labs/v2-solidity-utils/contracts/math/FixedPoint.sol";
import "@balancer-labs/v2-solidity-utils/contracts/math/Math.sol";

// These functions start with an underscore, as if they were part of a contract and not a library. At some point this
// should be fixed.
// solhint-disable private-vars-leading-underscore

library RangeMath {
    using FixedPoint for uint256;

    // Computes how many tokens can be taken out of a pool if `amountIn` are sent, given the
    // virtual balances and weights.
    function _calcOutGivenIn(
        uint256 virtualBalanceIn,
        uint256 weightIn,
        uint256 virtualBalanceOut,
        uint256 weightOut,
        uint256 amountIn,
        uint256 factBalance
    ) internal pure returns (uint256) {
        /**********************************************************************************************
        // outGivenIn                                                                                //
        // aO = amountOut                                                                            //
        // bO = virtualBalanceOut                                                                           //
        // bI = virtualBalanceIn              /      /            bI             \    (wI / wO) \           //
        // aI = amountIn    aO = bO * |  1 - | --------------------------  | ^            |          //
        // wI = weightIn               \      \       ( bI + aI )         /              /           //
        // wO = weightOut                                                                            //
        // if a0 exceeds factBalance, then a0 = factBalance                                          //                                 //
        **********************************************************************************************/

        // Amount out, so we round down overall.

        // The multiplication rounds down, and the subtrahend (power) rounds up (so the base rounds up too).
        // Because bI / (bI + aI) <= 1, the exponent rounds down.

        uint256 denominator = virtualBalanceIn.add(amountIn);
        uint256 base = virtualBalanceIn.divUp(denominator);
        uint256 exponent = weightIn.divDown(weightOut);
        uint256 power = base.powUp(exponent);

        return Math.min(factBalance, virtualBalanceOut.mulDown(power.complement()));
    }

    // Computes how many tokens must be sent to a pool in order to take `amountOut`, given the
    // virtual balances and weights.
    function _calcInGivenOut(
        uint256 virtualBalanceIn,
        uint256 weightIn,
        uint256 virtualBalanceOut,
        uint256 weightOut,
        uint256 amountOut
    ) internal pure returns (uint256) {
        /**********************************************************************************************
        // inGivenOut                                                                                //
        // aO = amountOut                                                                            //
        // bO = virtualBalanceOut                                                                           //
        // bI = virtualBalanceIn              /  /            bO             \    (wO / wI)      \          //
        // aI = amountIn    aI = bI * |  | --------------------------  | ^            - 1  |         //
        // wI = weightIn               \  \       ( bO - aO )         /                   /          //
        // wO = weightOut                                                                            //
        **********************************************************************************************/

        // Amount in, so we round up overall.

        // The multiplication rounds up, and the power rounds up (so the base rounds up too).
        // Because b0 / (b0 - a0) >= 1, the exponent rounds up.

        uint256 base = virtualBalanceOut.divUp(virtualBalanceOut.sub(amountOut));
        uint256 exponent = weightOut.divUp(weightIn);
        uint256 power = base.powUp(exponent);

        // Because the base is larger than one (and the power rounds up), the power should always be larger than one, so
        // the following subtraction should never revert.
        uint256 ratio = power.sub(FixedPoint.ONE);

        return virtualBalanceIn.mulUp(ratio);
    }

    function _calcBptOutGivenExactTokensIn(
        uint256[] memory factBalances,
        uint256[] memory amountsIn,
        uint256 bptTotalSupply
    ) internal pure returns (uint256) {
        uint256 ratioMin = _calcRatioMin(factBalances, amountsIn);
        return bptTotalSupply.mulUp(ratioMin).divDown(FixedPoint.ONE);
    }

    function _calcBptInGivenExactTokensOut(
        uint256[] memory factBalances,
        uint256[] memory amountsOut,
        uint256 bptTotalSupply
    ) internal pure returns (uint256) {
        uint256 ratioMin = _calcRatioMin(factBalances, amountsOut);
        return bptTotalSupply.mulUp(ratioMin).divDown(FixedPoint.ONE);
    }

    function _calcRatioMin(
        uint256[] memory factBalances,
        uint256[] memory amounts
    ) internal pure returns (uint256) {
        uint256 ratioMin = 0;
        uint256 i = 0;
        while (i < factBalances.length) {
            if (factBalances[i] > 0) {
                uint256 currentRatio = amounts[i].mulUp(FixedPoint.ONE).divDown(factBalances[i]);
                if (ratioMin > 0) {
                    ratioMin = Math.min(ratioMin, currentRatio);
                    if (ratioMin == 0) break;
                } else {
                    ratioMin = currentRatio;
                }
            }
            i++;
        }
        return ratioMin;
    }
}
