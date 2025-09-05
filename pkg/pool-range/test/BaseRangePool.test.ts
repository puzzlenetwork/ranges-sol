import { expect } from 'chai';
import { fp } from '@balancer-labs/v2-helpers/src/numbers';

import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import RangePool from './helpers/RangePool';

import { itBehavesAsRangePool } from './BaseRangePool.behavior';

describe('BaseRangePool', function () {
  context('for a 1 token pool', () => {
    it('reverts if there is a single token', async () => {
      const tokens = await TokenList.create(1);
      const weights = [fp(1)];

      await expect(RangePool.create({ tokens, weights })).to.be.revertedWith('MIN_TOKENS');
    });
  });

  context('for a 2 token pool', () => {
    itBehavesAsRangePool(2);
  });

  context('for a 3 token pool', () => {
    itBehavesAsRangePool(3);
  });

  context('for a too-many token pool', () => {
    it('reverts if there are too many tokens', async () => {
      // The maximum number of tokens is 20
      const tokens = await TokenList.create(11);
      const weights = new Array(21).fill(fp(1));

      await expect(RangePool.create({ tokens, weights })).to.be.revertedWith('MAX_TOKENS');
    });
  });
});
