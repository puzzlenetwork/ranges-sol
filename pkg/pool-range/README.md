# <img src="../../logo.svg" alt="Range" height="128px">

# Range Weighted Pools


This package contains the source code for Range Weighted Pools, that is, Pools that swap tokens by enforcing a Constant Weighted Product invariant.

The pool currently in existence is [`RangePool`](./contracts/RangePool.sol) (basic ten token version).

Another useful contract is [`RangeMath`](./contracts/RangeMath.sol), which implements the low level calculations required for swaps, joins, exits and price calculations.

## Overview

### Installation

```console
$ git clone  --recurse-submodules https://github.com/puzzlenetwork/ranges-sol

```

### Usage

This package can be used in multiple ways, including interacting with already deployed Pools, performing local testing, or even creating new Pool types that also use the Constant Weighted Product invariant.

To get the address of deployed contracts in both mainnet and various test networks, see [`range-deployments` repository](https://github.com/puzzlenetwork/range-deployments.git).


## Licensing

[GNU General Public License Version 3 (GPL v3)](../../LICENSE).
