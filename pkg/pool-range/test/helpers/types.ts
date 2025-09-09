import { BigNumber, ContractReceipt } from 'ethers';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/dist/src/signer-with-address';

import { BigNumberish } from '@balancer-labs/v2-helpers/src//numbers';

import Token from '@balancer-labs/v2-helpers/src/models/tokens/Token';
import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import { Account, NAry } from '@balancer-labs/v2-helpers/src/models/types/types';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';

export type RawRangePoolDeployment = {
  tokens?: TokenList;
  weights?: BigNumberish[];
  virtualBalances?: BigNumberish[];
  rateProviders?: Account[];
  assetManagers?: string[];
  swapFeePercentage?: BigNumberish;
  pauseWindowDuration?: BigNumberish;
  bufferPeriodDuration?: BigNumberish;
  owner?: Account;
  admin?: SignerWithAddress;
  from?: SignerWithAddress;
  vault?: Vault;
  fromFactory?: boolean;
};

export type RangePoolDeployment = {
  tokens: TokenList;
  weights: BigNumberish[];
  rateProviders: Account[];
  assetManagers: string[];
  swapFeePercentage: BigNumberish;
  pauseWindowDuration: BigNumberish;
  bufferPeriodDuration: BigNumberish;
  owner: Account;
  admin?: SignerWithAddress;
  from?: SignerWithAddress;
};

export type SwapRangePool = {
  in: number | Token;
  out: number | Token;
  amount: BigNumberish;
  balances?: BigNumberish[];
  recipient?: Account;
  from?: SignerWithAddress;
  lastChangeBlock?: BigNumberish;
  data?: string;
};

export type JoinExitRangePool = {
  recipient?: Account;
  currentBalances?: BigNumberish[];
  lastChangeBlock?: BigNumberish;
  protocolFeePercentage?: BigNumberish;
  data?: string;
  from?: SignerWithAddress;
};

export type InitRangePool = {
  initialBalances: NAry<BigNumberish>;
  initialVirtualBalances: NAry<BigNumberish>;
  from?: SignerWithAddress;
  recipient?: Account;
  protocolFeePercentage?: BigNumberish;
};

export type JoinGivenInRangePool = {
  amountsIn: NAry<BigNumberish>;
  minimumBptOut?: BigNumberish;
  from?: SignerWithAddress;
  recipient?: Account;
  lastChangeBlock?: BigNumberish;
  currentBalances?: BigNumberish[];
  protocolFeePercentage?: BigNumberish;
};

export type JoinGivenOutRangePool = {
  token: number | Token;
  bptOut: BigNumberish;
  from?: SignerWithAddress;
  recipient?: Account;
  lastChangeBlock?: BigNumberish;
  currentBalances?: BigNumberish[];
  protocolFeePercentage?: BigNumberish;
};

export type JoinAllGivenOutRangePool = {
  bptOut: BigNumberish;
  from?: SignerWithAddress;
  recipient?: Account;
  lastChangeBlock?: BigNumberish;
  currentBalances?: BigNumberish[];
  protocolFeePercentage?: BigNumberish;
};

export type ExitGivenOutRangePool = {
  amountsOut: NAry<BigNumberish>;
  maximumBptIn?: BigNumberish;
  recipient?: Account;
  from?: SignerWithAddress;
  lastChangeBlock?: BigNumberish;
  currentBalances?: BigNumberish[];
  protocolFeePercentage?: BigNumberish;
};

export type SingleExitGivenInRangePool = {
  bptIn: BigNumberish;
  token: number | Token;
  recipient?: Account;
  from?: SignerWithAddress;
  lastChangeBlock?: BigNumberish;
  currentBalances?: BigNumberish[];
  protocolFeePercentage?: BigNumberish;
};

export type MultiExitGivenInRangePool = {
  bptIn: BigNumberish;
  recipient?: Account;
  from?: SignerWithAddress;
  lastChangeBlock?: BigNumberish;
  currentBalances?: BigNumberish[];
  protocolFeePercentage?: BigNumberish;
};

export type JoinResult = {
  amountsIn: BigNumber[];
  dueProtocolFeeAmounts: BigNumber[];
  receipt: ContractReceipt;
};

export type ExitResult = {
  amountsOut: BigNumber[];
  dueProtocolFeeAmounts: BigNumber[];
  receipt: ContractReceipt;
};

export type SwapResult = {
  amount: BigNumber;
  receipt: ContractReceipt;
};

export type JoinQueryResult = {
  bptOut: BigNumber;
  amountsIn: BigNumber[];
};

export type ExitQueryResult = {
  bptIn: BigNumber;
  amountsOut: BigNumber[];
};

export type VoidResult = {
  receipt: ContractReceipt;
};

export type PoolQueryResult = JoinQueryResult | ExitQueryResult;

export type GradualWeightUpdateParams = {
  startTime: BigNumber;
  endTime: BigNumber;
  startWeights: BigNumber[];
  endWeights: BigNumber[];
};

export type GradualSwapFeeUpdateParams = {
  startTime: BigNumber;
  endTime: BigNumber;
  startSwapFeePercentage: BigNumber;
  endSwapFeePercentage: BigNumber;
};
