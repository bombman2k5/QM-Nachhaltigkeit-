import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

interface TierSpec {
  id: string;
  name: string;
  description: string;
  file: string;
}

const TIERS: TierSpec[] = [
  {
    id: 'T1',
    name: 'Tier 1: Feature Coverage',
    description: 'Verifies fundamental requirements across R1, R2, R3, R4',
    file: 'tests/e2e/tier1_feature_coverage.test.ts',
  },
  {
    id: 'T2',
    name: 'Tier 2: Boundary & Corner Cases',
    description: 'Adversarial inputs, magic bytes, oversized buffers, JWT edge cases',
    file: 'tests/e2e/tier2_boundary_corner.test.ts',
  },
  {
    id: 'T3',
    name: 'Tier 3: Cross-Feature Interactions',
    description: 'Pairwise combinations (Auth+Docs, TM+SDB Matrix, Rate Limits)',
    file: 'tests/e2e/tier3_cross_feature.test.ts',
  },
  {
    id: 'T4',
    name: 'Tier 4: Real-World Scenarios',
    description: 'Full E2E audit workflows and production server build lifecycle',
    file: 'tests/e2e/tier4_real_world.test.ts',
  },
  {
    id: 'T5A',
    name: 'Tier 5 (Backend): Adversarial Security & Endpoint Invariants',
    description: 'Backend security, rate limit bypass, Unicode magic bytes, and crypto invariants',
    file: 'tests/e2e/tier5_adversarial_backend.test.ts',
  },
  {
    id: 'T5B',
    name: 'Tier 5 (DGNB/TM): Adversarial Evaluation & Proof Engine',
    description: 'DGNB/QNG/BNB evaluation logic, triad collision, quote verification, and dates',
    file: 'tests/e2e/tier5_adversarial_dgnb_tm.test.ts',
  },
];

interface TierResult {
  spec: TierSpec;
  passed: boolean;
  exitCode: number | null;
  durationMs: number;
  output: string;
}

async function runTier(tier: TierSpec): Promise<TierResult> {
  const startTime = Date.now();
  console.log(`\n======================================================================`);
  console.log(`▶ RUNNING: ${tier.name}`);
  console.log(`  Description: ${tier.description}`);
  console.log(`  Target:      ${tier.file}`);
  console.log(`======================================================================\n`);

  const tsxCliPath = path.resolve(process.cwd(), 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const targetFilePath = path.resolve(process.cwd(), tier.file);

  return new Promise<TierResult>((resolve) => {
    let capturedOutput = '';

    const child = spawn(process.execPath, [tsxCliPath, '--test', targetFilePath], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        VERCEL: '1',
        NODE_ENV: 'test',
        ALLOW_UNAUTHENTICATED_API: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (data) => {
      const text = data.toString();
      capturedOutput += text;
      process.stdout.write(text);
    });

    child.stderr?.on('data', (data) => {
      const text = data.toString();
      capturedOutput += text;
      process.stderr.write(text);
    });

    child.on('close', (code) => {
      const durationMs = Date.now() - startTime;
      const passed = code === 0;

      if (passed) {
        console.log(`\n✔ [PASS] ${tier.name} completed successfully in ${(durationMs / 1000).toFixed(2)}s`);
      } else {
        console.error(`\n✖ [FAIL] ${tier.name} failed with exit code ${code} after ${(durationMs / 1000).toFixed(2)}s`);
      }

      resolve({
        spec: tier,
        passed,
        exitCode: code,
        durationMs,
        output: capturedOutput,
      });
    });

    child.on('error', (err) => {
      const durationMs = Date.now() - startTime;
      console.error(`\n✖ [ERROR] Failed to spawn process for ${tier.name}:`, err);
      resolve({
        spec: tier,
        passed: false,
        exitCode: 1,
        durationMs,
        output: capturedOutput + '\n' + String(err),
      });
    });
  });
}

async function main() {
  const totalStartTime = Date.now();

  console.log('\n######################################################################');
  console.log('# QM-Nachhaltigkeit: Master E2E Test Suite (Tiers 1–4)');
  console.log('# Node Runtime: ' + process.version + ' on ' + process.platform);
  console.log('# Working Directory: ' + process.cwd());
  console.log('######################################################################');

  const results: TierResult[] = [];
  let allPassed = true;

  for (const tier of TIERS) {
    const result = await runTier(tier);
    results.push(result);
    if (!result.passed) {
      allPassed = false;
    }
  }

  const totalDurationMs = Date.now() - totalStartTime;

  // Print final summary matrix
  console.log(`\n======================================================================`);
  console.log(`                      E2E TEST EXECUTION SUMMARY                      `);
  console.log(`======================================================================`);
  console.log(` Tier | Status | Duration | Requirement Areas`);
  console.log(`------+--------+----------+------------------------------------------`);

  for (const r of results) {
    const statusStr = r.passed ? ' PASS ' : ' FAIL ';
    const durStr = `${(r.durationMs / 1000).toFixed(2)}s`.padStart(7);
    console.log(` ${r.spec.id.padEnd(4)} | ${statusStr} | ${durStr}  | ${r.spec.description}`);
  }

  console.log(`----------------------------------------------------------------------`);
  console.log(`Total Time: ${(totalDurationMs / 1000).toFixed(2)}s`);
  console.log(`Overall Result: ${allPassed ? 'ALL TIERS PASSED (SUCCESS)' : 'ONE OR MORE TIERS FAILED'}`);
  console.log(`======================================================================\n`);

  if (!allPassed) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error executing E2E test runner:', err);
  process.exit(1);
});
