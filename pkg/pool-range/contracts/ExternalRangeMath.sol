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

import "./RangeMath.sol";

/**
 * @notice A contract-wrapper for Range Math.
 * @dev Use this contract as an external replacement for RangeMath.
 */
contract ExternalRangeMath {
    function calcOutGivenIn(
        uint256 balanceIn,
        uint256 weightIn,
        uint256 balanceOut,
        uint256 weightOut,
        uint256 amountIn,
        uint256 factBalance
    ) external pure returns (uint256) {
        return RangeMath._calcOutGivenIn(balanceIn, weightIn, balanceOut, weightOut, amountIn, factBalance);
    }

    function calcInGivenOut(
        uint256 balanceIn,
        uint256 weightIn,
        uint256 balanceOut,
        uint256 weightOut,
        uint256 amountOut
    ) external pure returns (uint256) {
        return RangeMath._calcInGivenOut(balanceIn, weightIn, balanceOut, weightOut, amountOut);
    }

    function calcBptOutGivenExactTokensIn(
        uint256[] memory balances,
        uint256[] memory amountsIn,
        uint256 bptTotalSupply
    ) external pure returns (uint256) {
        return
            RangeMath._calcBptOutGivenExactTokensIn(
                balances,
                amountsIn,
                bptTotalSupply
            );
    }

    function calcBptInGivenExactTokensOut(
        uint256[] memory balances,
        uint256[] memory amountsOut,
        uint256 bptTotalSupply
    ) external pure returns (uint256) {
        return
            RangeMath._calcBptInGivenExactTokensOut(
                balances,
                amountsOut,
                bptTotalSupply
            );
    }
}
