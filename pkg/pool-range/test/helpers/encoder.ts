import { defaultAbiCoder } from '@ethersproject/abi';
import { BigNumberish } from '@ethersproject/bignumber';

export enum RangePoolJoinKind {
  INIT = 0,
  EXACT_TOKENS_IN_FOR_BPT_OUT,
  TOKEN_IN_FOR_EXACT_BPT_OUT,
  ALL_TOKENS_IN_FOR_EXACT_BPT_OUT,
  ADD_TOKEN,
}

export enum RangePoolExitKind {
  EXACT_BPT_IN_FOR_ONE_TOKEN_OUT = 0,
  EXACT_BPT_IN_FOR_TOKENS_OUT,
  BPT_IN_FOR_EXACT_TOKENS_OUT,
  REMOVE_TOKEN,
}

export class RangePoolEncoder {
  /**
   * Cannot be constructed.
   */
  private constructor() {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
  }

  /**
   * Encodes the userData parameter for providing the initial liquidity to a WeightedPool
   * @param initialBalances - the amounts of tokens to send to the pool to form the initial balances
   */
  static joinInit = (amountsIn: BigNumberish[], vBalances: BigNumberish[]): string =>
    defaultAbiCoder.encode(['uint256', 'uint256[]', 'uint256[]'], [RangePoolJoinKind.INIT, amountsIn, vBalances]);
}
