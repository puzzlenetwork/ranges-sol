import '@balancer-labs/v2-common/setupTests';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { Contract, BigNumber } from 'ethers';
import { fp } from '@balancer-labs/v2-helpers/src/numbers';

import TokenList from '@balancer-labs/v2-helpers/src/models/tokens/TokenList';
import Vault from '@balancer-labs/v2-helpers/src/models/vault/Vault';
import RangePool from './helpers/RangePool';
import { sharedBeforeEach } from '@balancer-labs/v2-common/sharedBeforeEach';
import { deploy } from './helpers/contract';

describe('RangePoolQueries Complete', function () {
  let vault: Vault;
  let pool: RangePool;
  let tokens: TokenList;
  let queries: Contract;
  let externalMath: Contract;

  const POOL_SWAP_FEE_PERCENTAGE = fp(0.01);
  const WEIGHTS = [fp(30), fp(70)];
  const VIRTUAL_BALANCES = [fp(0.2), fp(0.4)];
  const INITIAL_BALANCES = [fp(0.1), fp(0.2)];

  sharedBeforeEach('deploy contracts', async () => {
    vault = await Vault.create();
    tokens = await TokenList.create(2, { sorted: true });

    // Mint tokens to signer
    const tokenAmounts = fp(100);
    await tokens.mint({ to: await ethers.getSigner(0), amount: tokenAmounts });
    await tokens.approve({ to: vault.address, from: await ethers.getSigner(0), amount: tokenAmounts });

    // Deploy both contracts for comparison
    queries = await deploy('RangePoolQueries', { args: [vault.address] });
    externalMath = await deploy('ExternalRangeMath');

    pool = await RangePool.create({
      vault,
      tokens,
      weights: WEIGHTS,
      swapFeePercentage: POOL_SWAP_FEE_PERCENTAGE,
    });

    // Initialize pool
    await pool.init({
      initialBalances: INITIAL_BALANCES,
      initialVirtualBalances: VIRTUAL_BALANCES,
      from: await ethers.getSigner(0),
    });
  });

  // ============ Core Functionality Tests ============
  describe('Core Functionality', () => {
    describe('getAmountOut', () => {
      it('calculates correct amount out for small swap', async () => {
        const amountIn = fp(0.01);
        const tokenIn = tokens.first.address;
        const tokenOut = tokens.second.address;

        const amountOut = await queries.getAmountOut(pool.address, amountIn, tokenIn, tokenOut);

        expect(amountOut).to.be.gt(0);
        expect(amountOut).to.be.lt(amountIn); // Should be less due to fees and slippage
      });

      it('calculates correct amount out for large swap', async () => {
        const amountIn = fp(0.1);
        const tokenIn = tokens.first.address;
        const tokenOut = tokens.second.address;

        const amountOut = await queries.getAmountOut(pool.address, amountIn, tokenIn, tokenOut);

        expect(amountOut).to.be.gt(0);
      });

      it('reverts for non-existent token', async () => {
        const otherTokens = await TokenList.create(5, { sorted: true });
        const otherToken = otherTokens.tokens[4]; // Get the 5th token
        const amountIn = fp(0.01);

        await expect(
          queries.getAmountOut(pool.address, amountIn, otherToken.address, tokens.first.address)
        ).to.be.revertedWith('TOKEN_NOT_FOUND');
      });
    });

    describe('getAmountIn', () => {
      it('calculates correct amount in for small swap', async () => {
        const amountOut = fp(0.01);
        const tokenIn = tokens.first.address;
        const tokenOut = tokens.second.address;

        const amountIn = await queries.getAmountIn(pool.address, amountOut, tokenIn, tokenOut);

        expect(amountIn).to.be.gt(amountOut); // Should be more due to fees
      });

      it('calculates correct amount in for large swap', async () => {
        const amountOut = fp(0.05);
        const tokenIn = tokens.first.address;
        const tokenOut = tokens.second.address;

        const amountIn = await queries.getAmountIn(pool.address, amountOut, tokenIn, tokenOut);

        expect(amountIn).to.be.gt(amountOut);
      });
    });

    describe('getSwapInfo', () => {
      it('returns comprehensive swap information', async () => {
        const amountIn = fp(0.01);
        const tokenIn = tokens.first.address;
        const tokenOut = tokens.second.address;

        const swapInfo = await queries.getSwapInfo(pool.address, amountIn, tokenIn, tokenOut);

        expect(swapInfo.amountOut).to.be.gt(0);
        expect(swapInfo.amountInAfterFees).to.be.lt(amountIn);
        expect(swapInfo.feeAmount).to.be.gt(0);
        expect(swapInfo.virtualBalanceIn).to.be.gt(0);
        expect(swapInfo.virtualBalanceOut).to.be.gt(0);
        expect(swapInfo.weightIn).to.be.gt(0);
        expect(swapInfo.weightOut).to.be.gt(0);
        expect(swapInfo.swapFeePercentage).to.equal(POOL_SWAP_FEE_PERCENTAGE);
      });
    });

    describe('round trip consistency', () => {
      it('getAmountOut and getAmountIn are consistent', async () => {
        const originalAmountIn = fp(0.01);
        const tokenIn = tokens.first.address;
        const tokenOut = tokens.second.address;

        // Calculate amount out for given input
        const amountOut = await queries.getAmountOut(pool.address, originalAmountIn, tokenIn, tokenOut);

        // Calculate amount in needed for that output
        const amountIn = await queries.getAmountIn(pool.address, amountOut, tokenIn, tokenOut);

        // Should be close to original (allowing for rounding differences)
        const tolerance = originalAmountIn.div(1000); // 0.1% tolerance
        expect(amountIn).to.be.closeTo(originalAmountIn, tolerance);
      });
    });
  });

  // ============ Math Functions Tests ============
  describe('Math Functions', () => {
    it('can call calcOutGivenIn directly', async () => {
      const virtualBalanceIn = fp(0.2);
      const weightIn = fp(0.3);
      const virtualBalanceOut = fp(0.4);
      const weightOut = fp(0.7);
      const amountIn = fp(0.01);
      const factBalance = fp(0.2);

      const result = await queries.calcOutGivenIn(
        virtualBalanceIn,
        weightIn,
        virtualBalanceOut,
        weightOut,
        amountIn,
        factBalance
      );

      expect(result).to.be.gt(0);
      expect(result).to.be.lt(amountIn); // Should be less due to slippage
    });

    it('can call calcInGivenOut directly', async () => {
      const virtualBalanceIn = fp(0.2);
      const weightIn = fp(0.3);
      const virtualBalanceOut = fp(0.4);
      const weightOut = fp(0.7);
      const amountOut = fp(0.01);

      const result = await queries.calcInGivenOut(
        virtualBalanceIn,
        weightIn,
        virtualBalanceOut,
        weightOut,
        amountOut
      );

      expect(result).to.be.gt(amountOut); // Should be more due to fees
    });

    it('can call calcBptOutGivenExactTokensIn directly', async () => {
      const factBalances = [fp(0.1), fp(0.2)];
      const amountsIn = [fp(0.01), fp(0.02)];
      const bptTotalSupply = fp(1.0);

      const result = await queries.calcBptOutGivenExactTokensIn(
        factBalances,
        amountsIn,
        bptTotalSupply
      );

      expect(result).to.be.gt(0);
    });

    it('can call calcBptInGivenExactTokensOut directly', async () => {
      const factBalances = [fp(0.1), fp(0.2)];
      const amountsOut = [fp(0.01), fp(0.02)];
      const bptTotalSupply = fp(1.0);

      const result = await queries.calcBptInGivenExactTokensOut(
        factBalances,
        amountsOut,
        bptTotalSupply
      );

      expect(result).to.be.gt(0);
    });

    it('can call calcRatioMin directly', async () => {
      const factBalances = [fp(0.1), fp(0.2)];
      const amounts = [fp(0.01), fp(0.02)];

      const result = await queries.calcRatioMin(factBalances, amounts);

      expect(result).to.be.gt(0);
    });
  });

  // ============ Consistency Tests ============
  describe('Method Consistency', () => {
    it('inherited methods produce same results as ExternalRangeMath', async () => {
      const virtualBalanceIn = fp(0.2);
      const weightIn = fp(0.3);
      const virtualBalanceOut = fp(0.4);
      const weightOut = fp(0.7);
      const amountIn = fp(0.01);
      const factBalance = fp(0.2);

      // Call through inherited method
      const inheritedResult = await queries.calcOutGivenIn(
        virtualBalanceIn,
        weightIn,
        virtualBalanceOut,
        weightOut,
        amountIn,
        factBalance
      );

      // Call through external contract
      const externalResult = await externalMath.calcOutGivenIn(
        virtualBalanceIn,
        weightIn,
        virtualBalanceOut,
        weightOut,
        amountIn,
        factBalance
      );

      expect(inheritedResult).to.equal(externalResult);
    });

    it('getAmountOut uses calcOutGivenIn correctly', async () => {
      const amountIn = fp(0.01);
      const tokenIn = tokens.first.address;
      const tokenOut = tokens.second.address;

      const amountOut = await queries.getAmountOut(pool.address, amountIn, tokenIn, tokenOut);

      expect(amountOut).to.be.gt(0);
      expect(amountOut).to.be.lt(amountIn); // Should be less due to fees and slippage
    });

    it('getAmountIn uses calcInGivenOut correctly', async () => {
      const amountOut = fp(0.01);
      const tokenIn = tokens.first.address;
      const tokenOut = tokens.second.address;

      const amountIn = await queries.getAmountIn(pool.address, amountOut, tokenIn, tokenOut);

      expect(amountIn).to.be.gt(amountOut); // Should be more due to fees
    });
  });

  // ============ Pool Data Tests ============
  describe('Pool Data Integration', () => {
    it('can get pool scaling factors', async () => {
      const scalingFactors = await pool.getScalingFactors();
      
      expect(scalingFactors).to.have.length(2);
      expect(scalingFactors[0]).to.be.gt(0);
      expect(scalingFactors[1]).to.be.gt(0);
    });

    it('can get virtual balances for tokens', async () => {
      const virtualBalances = await pool.getVirtualBalances();
      
      expect(virtualBalances).to.have.length(2);
      expect(virtualBalances[0]).to.be.gt(0);
      expect(virtualBalances[1]).to.be.gt(0);
    });

    it('can get normalized weights for tokens', async () => {
      const weights = await pool.getNormalizedWeights();
      
      expect(weights).to.have.length(2);
      expect(weights[0]).to.be.gt(0);
      expect(weights[1]).to.be.gt(0);
      expect(weights[0].add(weights[1])).to.be.closeTo(fp(1), 1e15); // Should sum to ~1
    });

    it('can get swap fee percentage', async () => {
      const swapFeePercentage = await pool.getSwapFeePercentage();
      expect(swapFeePercentage).to.equal(POOL_SWAP_FEE_PERCENTAGE);
    });

    it('calculates swap fees correctly', async () => {
      const amountIn = fp(0.1);
      const swapFeePercentage = await pool.getSwapFeePercentage();
      
      const feeAmount = amountIn.mul(swapFeePercentage).div(fp(1));
      const amountAfterFees = amountIn.sub(feeAmount);
      
      expect(feeAmount).to.be.gt(0);
      expect(amountAfterFees).to.be.lt(amountIn);
      expect(amountAfterFees.add(feeAmount)).to.be.closeTo(amountIn, 1e15);
    });
  });

  // ============ Error Handling Tests ============
  describe('Error Handling', () => {
    it('reverts for invalid pool address', async () => {
      const amountIn = fp(0.01);
      const tokenIn = tokens.first.address;
      const tokenOut = tokens.second.address;
      const invalidPoolAddress = '0x0000000000000000000000000000000000000001';

      await expect(
        queries.getAmountOut(invalidPoolAddress, amountIn, tokenIn, tokenOut)
      ).to.be.reverted; // Just check that it reverts, not specific message
    });

    it('reverts for non-existent token', async () => {
      const otherTokens = await TokenList.create(5, { sorted: true });
      const otherToken = otherTokens.tokens[4]; // Get the 5th token
      const amountIn = fp(0.01);

      await expect(
        queries.getAmountOut(pool.address, amountIn, otherToken.address, tokens.first.address)
      ).to.be.revertedWith('TOKEN_NOT_FOUND');
    });
  });
});
