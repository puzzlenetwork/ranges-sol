import { BigNumber, Contract, ContractFunction, ContractReceipt, ContractTransaction } from 'ethers';
import { BigNumberish, bn, fp, fromFp, fpMul } from '@balancer-labs/v2-helpers/src/numbers';
import { MAX_UINT256, ZERO_ADDRESS } from '@balancer-labs/v2-helpers/src/constants';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';
import Token from '@balancer-labs/v2-helpers/src/models/tokens/Token';
import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import TypesConverter from '@balancer-labs/v2-helpers/src/models/types/TypesConverter';
import { GeneralSwap } from '@balancer-labs/v2-helpers/src/models/vault/types';
import {
  JoinExitRangePool,
  InitRangePool,
  JoinGivenInRangePool,
  JoinGivenOutRangePool,
  JoinAllGivenOutRangePool,
  JoinResult,
  ExitResult,
  SwapResult,
  SingleExitGivenInRangePool,
  MultiExitGivenInRangePool,
  ExitGivenOutRangePool,
  SwapRangePool,
  ExitQueryResult,
  JoinQueryResult,
  PoolQueryResult,
  GradualWeightUpdateParams,
} from './types';
import {
  calculateInvariant,
  calcTokenInGivenExactBptOut,
  calcTokenOutGivenExactBptIn,
  calcOutGivenIn,
  calcInGivenOut,
} from '@balancer-labs/v2-helpers/src/models/pools/weighted/math';

import { SwapKind, WeightedPoolEncoder } from '@balancer-labs/balancer-js';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import BasePool from '@balancer-labs/v2-helpers/src/models/pools/base/BasePool';
import { Account } from '@balancer-labs/v2-helpers/src/models/types/types';

const MAX_IN_RATIO = fp(0.3);
const MAX_OUT_RATIO = fp(0.3);
const MAX_INVARIANT_RATIO = fp(3);
const MIN_INVARIANT_RATIO = fp(0.7);

export default class BaseRangePool extends BasePool {
  weights: BigNumberish[];
  vbalances: BigNumberish[];

  constructor(
    instance: Contract,
    poolId: string,
    vault: Vault,
    tokens: TokenList,
    weights: BigNumberish[],
    virtualBalances: BigNumberish[],
    swapFeePercentage: BigNumberish,
    owner?: Account
  ) {
    super(instance, poolId, vault, tokens, swapFeePercentage, owner);

    this.weights = weights;
    this.vbalances = virtualBalances;
  }

  get normalizedWeights(): BigNumberish[] {
    return this.weights;
  }

  get virtualBalances(): BigNumberish[] {
    return this.vbalances;
  }

  async getLastPostJoinExitInvariant(): Promise<BigNumber> {
    return this.instance.getLastPostJoinExitInvariant();
  }

  async getMaxInvariantDecrease(): Promise<BigNumber> {
    const supply = await this.totalSupply();
    return supply.sub(fpMul(MIN_INVARIANT_RATIO, supply));
  }

  async getMaxInvariantIncrease(): Promise<BigNumber> {
    const supply = await this.totalSupply();
    return fpMul(MAX_INVARIANT_RATIO, supply).sub(supply);
  }

  async getMaxIn(tokenIndex: number, currentBalances?: BigNumber[]): Promise<BigNumber> {
    if (!currentBalances) currentBalances = await this.getBalances();
    return fpMul(currentBalances[tokenIndex], MAX_IN_RATIO);
  }

  async getMaxOut(tokenIndex: number, currentBalances?: BigNumber[]): Promise<BigNumber> {
    if (!currentBalances) currentBalances = await this.getBalances();
    return fpMul(currentBalances[tokenIndex], MAX_OUT_RATIO);
  }

  async getNormalizedWeights(): Promise<BigNumber[]> {
    return this.instance.getNormalizedWeights();
  }

  async estimateInvariant(currentBalances?: BigNumberish[]): Promise<BigNumber> {
    if (!currentBalances) currentBalances = await this.getBalances();
    const scalingFactors = await this.getScalingFactors();

    return calculateInvariant(
      currentBalances.map((x, i) => fpMul(x, scalingFactors[i])),
      this.weights
    );
  }

  async estimateGivenIn(params: SwapRangePool, currentBalances?: BigNumberish[]): Promise<BigNumberish> {
    if (!currentBalances) currentBalances = await this.getBalances();
    const [tokenIn, tokenOut] = this.tokens.indicesOfTwoTokens(params.in, params.out);

    return bn(
      calcOutGivenIn(
        currentBalances[tokenIn],
        this.weights[tokenIn],
        currentBalances[tokenOut],
        this.weights[tokenOut],
        params.amount
      )
    );
  }

  async estimateGivenOut(params: SwapRangePool, currentBalances?: BigNumberish[]): Promise<BigNumberish> {
    if (!currentBalances) currentBalances = await this.getBalances();
    const [tokenIn, tokenOut] = this.tokens.indicesOfTwoTokens(params.in, params.out);

    return bn(
      calcInGivenOut(
        currentBalances[tokenIn],
        this.weights[tokenIn],
        currentBalances[tokenOut],
        this.weights[tokenOut],
        params.amount
      )
    );
  }

  async calcBptOutGivenExactTokensIn(
    fpBalances: BigNumberish[],
    fpAmountsIn: BigNumberish[],
    fpBptTotalSupply: BigNumberish
  ): Promise<BigNumberish> {
    const balances = fpBalances.map(fromFp);
    const amountsIn = fpAmountsIn.map(fromFp);
    const bptTotalSupply = fromFp(fpBptTotalSupply);

    let ratioMin = amountsIn[0].div(balances[0]);
    let i = 1;
    while (i < balances.length && ratioMin.gt(0)) {
      const tmp = amountsIn[i].div(balances[i]);
      if (tmp < ratioMin) ratioMin = tmp;
      i++;
    }
    return fp(bptTotalSupply.mul(ratioMin));
  }

  async estimateBptOut(
    amountsIn: BigNumberish[],
    currentBalances?: BigNumberish[],
    supply?: BigNumberish
  ): Promise<BigNumberish> {
    if (!supply) supply = await this.totalSupply();
    if (!currentBalances) currentBalances = await this.getBalances();
    return this.calcBptOutGivenExactTokensIn(currentBalances, amountsIn, supply);
  }

  async estimateTokenIn(
    token: number | Token,
    bptOut: BigNumberish,
    currentBalances?: BigNumberish[],
    supply?: BigNumberish
  ): Promise<BigNumberish> {
    if (!supply) supply = await this.totalSupply();
    if (!currentBalances) currentBalances = await this.getBalances();
    const tokenIndex = this.tokens.indexOf(token);
    return calcTokenInGivenExactBptOut(
      tokenIndex,
      currentBalances,
      this.weights,
      bptOut,
      supply,
      this.swapFeePercentage
    );
  }

  async estimateTokenOut(
    token: number | Token,
    bptIn: BigNumberish,
    currentBalances?: BigNumberish[],
    supply?: BigNumberish
  ): Promise<BigNumberish> {
    if (!supply) supply = await this.totalSupply();
    if (!currentBalances) currentBalances = await this.getBalances();
    const tokenIndex = this.tokens.indexOf(token);
    return calcTokenOutGivenExactBptIn(
      tokenIndex,
      currentBalances,
      this.weights,
      bptIn,
      supply,
      this.swapFeePercentage
    );
  }

  async swapGivenIn(params: SwapRangePool): Promise<SwapResult> {
    return this.swap(await this._buildSwapParams(SwapKind.GivenIn, params));
  }

  async swapGivenOut(params: SwapRangePool): Promise<SwapResult> {
    return this.swap(await this._buildSwapParams(SwapKind.GivenOut, params));
  }

  async updateProtocolFeePercentageCache(): Promise<ContractTransaction> {
    return this.instance.updateProtocolFeePercentageCache();
  }

  async swap(params: GeneralSwap): Promise<SwapResult> {
    let receipt: ContractReceipt;
    if (this.vault.mocked) {
      const tx = await this.vault.generalSwap(params);
      receipt = await tx.wait();
    } else {
      if (!params.from) throw new Error('No signer provided');
      const tx = await this.vault.instance.connect(params.from).swap(
        {
          poolId: params.poolId,
          kind: params.kind,
          assetIn: params.tokenIn,
          assetOut: params.tokenOut,
          amount: params.amount,
          userData: params.data,
        },
        {
          sender: TypesConverter.toAddress(params.from),
          recipient: TypesConverter.toAddress(params.to) ?? ZERO_ADDRESS,
          fromInternalBalance: false,
          toInternalBalance: false,
        },
        params.kind == 0 ? 0 : MAX_UINT256,
        MAX_UINT256
      );
      receipt = await tx.wait();
    }
    const { amountIn, amountOut } = expectEvent.inReceipt(receipt, 'Swap').args;
    const amount = params.kind == SwapKind.GivenIn ? amountOut : amountIn;

    return { amount, receipt };
  }

  async init(params: InitRangePool): Promise<JoinResult> {
    return this.join(this._buildInitParams(params));
  }

  async joinGivenIn(params: JoinGivenInRangePool): Promise<JoinResult> {
    return this.join(this._buildJoinGivenInParams(params));
  }

  async queryJoinGivenIn(params: JoinGivenInRangePool): Promise<JoinQueryResult> {
    return this.queryJoin(this._buildJoinGivenInParams(params));
  }

  async joinGivenOut(params: JoinGivenOutRangePool): Promise<JoinResult> {
    return this.join(this._buildJoinGivenOutParams(params));
  }

  async queryJoinGivenOut(params: JoinGivenOutRangePool): Promise<JoinQueryResult> {
    return this.queryJoin(this._buildJoinGivenOutParams(params));
  }

  async joinAllGivenOut(params: JoinAllGivenOutRangePool): Promise<JoinResult> {
    return this.join(this._buildJoinAllGivenOutParams(params));
  }

  async queryJoinAllGivenOut(params: JoinAllGivenOutRangePool): Promise<JoinQueryResult> {
    return this.queryJoin(this._buildJoinAllGivenOutParams(params));
  }

  async exitGivenOut(params: ExitGivenOutRangePool): Promise<ExitResult> {
    return this.exit(this._buildExitGivenOutParams(params));
  }

  async queryExitGivenOut(params: ExitGivenOutRangePool): Promise<ExitQueryResult> {
    return this.queryExit(this._buildExitGivenOutParams(params));
  }

  async singleExitGivenIn(params: SingleExitGivenInRangePool): Promise<ExitResult> {
    return this.exit(this._buildSingleExitGivenInParams(params));
  }

  async querySingleExitGivenIn(params: SingleExitGivenInRangePool): Promise<ExitQueryResult> {
    return this.queryExit(this._buildSingleExitGivenInParams(params));
  }

  async multiExitGivenIn(params: MultiExitGivenInRangePool): Promise<ExitResult> {
    return this.exit(this._buildMultiExitGivenInParams(params));
  }

  async queryMultiExitGivenIn(params: MultiExitGivenInRangePool): Promise<ExitQueryResult> {
    return this.queryExit(this._buildMultiExitGivenInParams(params));
  }

  async queryJoin(params: JoinExitRangePool): Promise<JoinQueryResult> {
    const fn = this.instance.queryJoin;
    return (await this._executeQuery(params, fn)) as JoinQueryResult;
  }

  async join(params: JoinExitRangePool): Promise<JoinResult> {
    const currentBalances = params.currentBalances || (await this.getBalances());
    const to = params.recipient ? TypesConverter.toAddress(params.recipient) : params.from?.address ?? ZERO_ADDRESS;
    const { tokens } = await this.getTokens();

    const tx = await this.vault.joinPool({
      poolAddress: this.address,
      poolId: this.poolId,
      recipient: to,
      currentBalances,
      tokens,
      lastChangeBlock: params.lastChangeBlock ?? 0,
      protocolFeePercentage: params.protocolFeePercentage ?? 0,
      data: params.data ?? '0x',
      from: params.from,
    });

    const receipt = await tx.wait();
    const { deltas, protocolFeeAmounts } = expectEvent.inReceipt(receipt, 'PoolBalanceChanged').args;
    return { amountsIn: deltas, dueProtocolFeeAmounts: protocolFeeAmounts, receipt };
  }

  async queryExit(params: JoinExitRangePool): Promise<ExitQueryResult> {
    const fn = this.instance.queryExit;
    return (await this._executeQuery(params, fn)) as ExitQueryResult;
  }

  async exit(params: JoinExitRangePool): Promise<ExitResult> {
    const currentBalances = params.currentBalances || (await this.getBalances());
    const to = params.recipient ? TypesConverter.toAddress(params.recipient) : params.from?.address ?? ZERO_ADDRESS;
    const { tokens } = await this.getTokens();

    const tx = await this.vault.exitPool({
      poolAddress: this.address,
      poolId: this.poolId,
      recipient: to,
      currentBalances,
      tokens,
      lastChangeBlock: params.lastChangeBlock ?? 0,
      protocolFeePercentage: params.protocolFeePercentage ?? 0,
      data: params.data ?? '0x',
      from: params.from,
    });

    const receipt = await tx.wait();
    const { deltas, protocolFeeAmounts } = expectEvent.inReceipt(receipt, 'PoolBalanceChanged').args;
    return { amountsOut: deltas.map((x: BigNumber) => x.mul(-1)), dueProtocolFeeAmounts: protocolFeeAmounts, receipt };
  }

  private async _executeQuery(params: JoinExitRangePool, fn: ContractFunction): Promise<PoolQueryResult> {
    const currentBalances = params.currentBalances || (await this.getBalances());
    const to = params.recipient ? TypesConverter.toAddress(params.recipient) : params.from?.address ?? ZERO_ADDRESS;

    return fn(
      this.poolId,
      params.from?.address || ZERO_ADDRESS,
      to,
      currentBalances,
      params.lastChangeBlock ?? 0,
      params.protocolFeePercentage ?? 0,
      params.data ?? '0x'
    );
  }

  private async _buildSwapParams(kind: number, params: SwapRangePool): Promise<GeneralSwap> {
    const currentBalances = await this.getBalances();
    const { tokens } = await this.vault.getPoolTokens(this.poolId);
    const tokenIn = typeof params.in === 'number' ? tokens[params.in] : params.in.address;
    const tokenOut = typeof params.out === 'number' ? tokens[params.out] : params.out.address;
    const indexIn = currentBalances[tokens.indexOf(tokenIn)];
    const indexOut = currentBalances[tokens.indexOf(tokenOut)];
    return {
      kind,
      poolAddress: this.address,
      poolId: this.poolId,
      from: params.from,
      to: params.recipient ?? ZERO_ADDRESS,
      tokenIn: tokenIn ?? ZERO_ADDRESS,
      tokenOut: tokenOut ?? ZERO_ADDRESS,
      balances: currentBalances,
      indexIn: indexIn ? indexIn.toNumber() : 0,
      indexOut: indexOut ? indexOut.toNumber() : 0,
      lastChangeBlock: params.lastChangeBlock ?? 0,
      data: params.data ?? '0x',
      amount: params.amount,
    };
  }

  private _buildInitParams(params: InitRangePool): JoinExitRangePool {
    const { initialBalances: balances } = params;
    const amountsIn = Array.isArray(balances) ? balances : Array(this.tokens.length).fill(balances);

    return {
      from: params.from,
      recipient: params.recipient,
      protocolFeePercentage: params.protocolFeePercentage,
      data: WeightedPoolEncoder.joinInit(amountsIn),
    };
  }

  private _buildJoinGivenInParams(params: JoinGivenInRangePool): JoinExitRangePool {
    const { amountsIn: amounts } = params;
    const amountsIn = Array.isArray(amounts) ? amounts : Array(this.tokens.length).fill(amounts);

    return {
      from: params.from,
      recipient: params.recipient,
      lastChangeBlock: params.lastChangeBlock,
      currentBalances: params.currentBalances,
      protocolFeePercentage: params.protocolFeePercentage,
      data: WeightedPoolEncoder.joinExactTokensInForBPTOut(amountsIn, params.minimumBptOut ?? 0),
    };
  }

  private _buildJoinGivenOutParams(params: JoinGivenOutRangePool): JoinExitRangePool {
    return {
      from: params.from,
      recipient: params.recipient,
      lastChangeBlock: params.lastChangeBlock,
      currentBalances: params.currentBalances,
      protocolFeePercentage: params.protocolFeePercentage,
      data: WeightedPoolEncoder.joinTokenInForExactBPTOut(params.bptOut, this.tokens.indexOf(params.token)),
    };
  }

  private _buildJoinAllGivenOutParams(params: JoinAllGivenOutRangePool): JoinExitRangePool {
    return {
      from: params.from,
      recipient: params.recipient,
      lastChangeBlock: params.lastChangeBlock,
      currentBalances: params.currentBalances,
      protocolFeePercentage: params.protocolFeePercentage,
      data: WeightedPoolEncoder.joinAllTokensInForExactBPTOut(params.bptOut),
    };
  }

  private _buildExitGivenOutParams(params: ExitGivenOutRangePool): JoinExitRangePool {
    const { amountsOut: amounts } = params;
    const amountsOut = Array.isArray(amounts) ? amounts : Array(this.tokens.length).fill(amounts);
    return {
      from: params.from,
      recipient: params.recipient,
      lastChangeBlock: params.lastChangeBlock,
      currentBalances: params.currentBalances,
      protocolFeePercentage: params.protocolFeePercentage,
      data: WeightedPoolEncoder.exitBPTInForExactTokensOut(amountsOut, params.maximumBptIn ?? MAX_UINT256),
    };
  }

  private _buildSingleExitGivenInParams(params: SingleExitGivenInRangePool): JoinExitRangePool {
    return {
      from: params.from,
      recipient: params.recipient,
      lastChangeBlock: params.lastChangeBlock,
      currentBalances: params.currentBalances,
      protocolFeePercentage: params.protocolFeePercentage,
      data: WeightedPoolEncoder.exitExactBPTInForOneTokenOut(params.bptIn, this.tokens.indexOf(params.token)),
    };
  }

  private _buildMultiExitGivenInParams(params: MultiExitGivenInRangePool): JoinExitRangePool {
    return {
      from: params.from,
      recipient: params.recipient,
      lastChangeBlock: params.lastChangeBlock,
      currentBalances: params.currentBalances,
      protocolFeePercentage: params.protocolFeePercentage,
      data: WeightedPoolEncoder.exitExactBPTInForTokensOut(params.bptIn),
    };
  }

  async setJoinExitEnabled(from: SignerWithAddress, joinExitEnabled: boolean): Promise<ContractTransaction> {
    const pool = this.instance.connect(from);
    return pool.setJoinExitEnabled(joinExitEnabled);
  }

  async setSwapEnabled(from: SignerWithAddress, swapEnabled: boolean): Promise<ContractTransaction> {
    const pool = this.instance.connect(from);
    return pool.setSwapEnabled(swapEnabled);
  }

  async setSwapFeePercentage(from: SignerWithAddress, swapFeePercentage: BigNumberish): Promise<ContractTransaction> {
    const pool = this.instance.connect(from);
    return pool.setSwapFeePercentage(swapFeePercentage);
  }

  async updateWeightsGradually(
    from: SignerWithAddress,
    startTime: BigNumberish,
    endTime: BigNumberish,
    endWeights: BigNumberish[]
  ): Promise<ContractTransaction> {
    const pool = this.instance.connect(from);

    return await pool.updateWeightsGradually(startTime, endTime, endWeights);
  }

  async getGradualWeightUpdateParams(from?: SignerWithAddress): Promise<GradualWeightUpdateParams> {
    const pool = from ? this.instance.connect(from) : this.instance;
    return await pool.getGradualWeightUpdateParams();
  }
}
