import { toNormalizedWeights } from '@balancer-labs/balancer-js';

import { bn, fp } from '@balancer-labs/v2-helpers/src/numbers';
import { MONTH } from '@balancer-labs/v2-helpers/src/time';
import { ZERO_ADDRESS } from '@balancer-labs/v2-helpers/src/constants';
import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import { Account } from '@balancer-labs/v2-helpers/src/models/types/types';
import {
  RawRangePoolDeployment,
  RangePoolDeployment,
} from './types';

const DEFAULT_PAUSE_WINDOW_DURATION = 3 * MONTH;
const DEFAULT_BUFFER_PERIOD_DURATION = MONTH;

export function computeDecimalsFromIndex(i: number): number {
  // Produces repeating series (0..18)
  return i % 19;
}

export default {
  toRangePoolDeployment(params: RawRangePoolDeployment): RangePoolDeployment {
    let {
      tokens,
      weights,
      virtualBalances,
      rateProviders,
      assetManagers,
      swapFeePercentage,
      pauseWindowDuration,
      bufferPeriodDuration,
    } = params;
    if (!params.owner) params.owner = ZERO_ADDRESS;
    if (!tokens) tokens = new TokenList();
    if (!weights) weights = Array(tokens.length).fill(fp(1));
    weights = toNormalizedWeights(weights.map(bn));
    if (!virtualBalances) virtualBalances = Array(tokens.length).fill(0);
    if (!swapFeePercentage) swapFeePercentage = bn(1e16);
    if (!pauseWindowDuration) pauseWindowDuration = DEFAULT_PAUSE_WINDOW_DURATION;
    if (!bufferPeriodDuration) bufferPeriodDuration = DEFAULT_BUFFER_PERIOD_DURATION;
    if (!rateProviders) rateProviders = Array(tokens.length).fill(ZERO_ADDRESS);
    if (!assetManagers) assetManagers = Array(tokens.length).fill(ZERO_ADDRESS);

    return {
      tokens,
      weights,
      virtualBalances,
      rateProviders,
      assetManagers,
      swapFeePercentage,
      pauseWindowDuration,
      bufferPeriodDuration,
      owner: this.toAddress(params.owner),
      from: params.from,
    };
  },

  toAddresses(to: Account[]): string[] {
    return to.map(this.toAddress);
  },

  toAddress(to?: Account): string {
    if (!to) return ZERO_ADDRESS;
    return typeof to === 'string' ? to : to.address;
  },
};
