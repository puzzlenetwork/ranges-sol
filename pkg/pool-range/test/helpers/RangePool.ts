import { Contract } from 'ethers';
import TypesConverter from '@balancer-labs/v2-helpers/src/models/types/TypesConverter';
import RangeTypesConverter from './TypesConverter';
import VaultDeployer from '@balancer-labs/v2-helpers/src/models/vault/VaultDeployer';
import BaseRangePool from './BaseRangePool';
import {
  BUFFER_PERIOD_DURATION,
  NAME,
  PAUSE_WINDOW_DURATION,
  SYMBOL,
} from '@balancer-labs/v2-helpers/src/models/pools/base/BasePool';
import { RawRangePoolDeployment, RangePoolDeployment } from './types';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';
import { deploy, deployedAt } from './contract';
import * as expectEvent from '@balancer-labs/v2-helpers/src/test/expectEvent';
import { Account } from '@balancer-labs/v2-helpers/src/models/types/types';
import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import { BigNumberish } from '@balancer-labs/v2-helpers/src/numbers';
import { randomBytes } from 'ethers/lib/utils';

export default class RangePool extends BaseRangePool {
  rateProviders: Account[];
  assetManagers: string[];

  constructor(
    instance: Contract,
    poolId: string,
    vault: Vault,
    tokens: TokenList,
    weights: BigNumberish[],
    rateProviders: Account[],
    assetManagers: string[],
    swapFeePercentage: BigNumberish,
    owner?: Account
  ) {
    super(instance, poolId, vault, tokens, weights, swapFeePercentage, owner);

    this.rateProviders = rateProviders;
    this.assetManagers = assetManagers;
  }

  static async create(params: RawRangePoolDeployment = {}): Promise<RangePool> {
    const vault = params?.vault ?? (await VaultDeployer.deploy(TypesConverter.toRawVaultDeployment(params)));
    const deployment = RangeTypesConverter.toRangePoolDeployment(params);
    const pool = await (params.fromFactory ? this._deployFromFactory : this._deployStandalone)(deployment, vault);
    const poolId = await pool.getPoolId();

    const { tokens, weights, rateProviders, assetManagers, swapFeePercentage, owner } = deployment;

    return new RangePool(
      pool,
      poolId,
      vault,
      tokens,
      weights,
      rateProviders,
      assetManagers,
      swapFeePercentage,
      owner
    );
  }

  static async _deployStandalone(params: RangePoolDeployment, vault: Vault): Promise<Contract> {
    const { from } = params;

    return deploy('RangePool', {
      args: [
        {
          name: NAME,
          symbol: SYMBOL,
          tokens: params.tokens.addresses,
          normalizedWeights: params.weights,
          rateProviders: TypesConverter.toAddresses(params.rateProviders),
          assetManagers: params.assetManagers,
          swapFeePercentage: params.swapFeePercentage,
        },
        vault.address,
        vault.protocolFeesProvider.address,
        params.pauseWindowDuration,
        params.bufferPeriodDuration,
        params.owner,
      ],
      from,
    });
  }

  static async _deployFromFactory(params: RangePoolDeployment, vault: Vault): Promise<Contract> {
    // Note that we only support asset managers with the standalone deploy method.

    const { tokens, weights, rateProviders, swapFeePercentage, owner, from } = params;

    const factory = await deploy('RangePoolFactory', {
      args: [vault.address, vault.getFeesProvider().address, PAUSE_WINDOW_DURATION, BUFFER_PERIOD_DURATION],
      from,
    });

    const tx = await factory.create(
      NAME,
      SYMBOL,
      tokens.addresses,
      weights,
      rateProviders,
      swapFeePercentage,
      owner,
      randomBytes(32)
    );
    const receipt = await tx.wait();
    const event = expectEvent.inReceipt(receipt, 'PoolCreated');
    return deployedAt('RangePool', event.args.pool);
  }
}
