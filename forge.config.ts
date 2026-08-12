import type { ForgeConfig } from '@electron-forge/shared-types';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { getCurrentSchemaRevision } from './src/main/database';
import { resolveBuildRevisionSync } from './src/main/build-revision';
import { createBuildProvenance } from './src/main/build-provenance';
import { createArtifactSha256, createReleaseArtifactManifest } from './src/main/release-artifact-manifest';
import type { ReleaseArtifactBuildEnvironment } from './src/shared/release-artifact-manifest-contracts';

const buildEnvironment: ReleaseArtifactBuildEnvironment = process.env.EPIC_BOS_NATIVE_BUILD === 'true'
  ? 'native'
  : process.env.EPIC_BOS_ZIP_ONLY_CROSS_BUILD === 'true'
    ? 'cross'
    : 'unknown';

const defaultMakers = [
  new MakerSquirrel({}),
  new MakerZIP({}, ['darwin', 'linux']),
  new MakerRpm({}),
  new MakerDeb({}),
];

/**
 * A Windows host cannot run the native Linux RPM/DEB makers. CI/native Linux
 * release jobs keep the full maker set; an operator may explicitly request a
 * ZIP-only cross-build for artifact inspection, never as platform certification.
 */
const makers = process.env.EPIC_BOS_ZIP_ONLY_CROSS_BUILD === 'true'
  ? [new MakerZIP({}, ['darwin', 'linux'])]
  : defaultMakers;

const config: ForgeConfig = {
  // Allows a fresh package to be produced while a prior desktop build is still open.
  // The default remains the documented `out/` directory.
  outDir: process.env.EPIC_BOS_OUT_DIR ?? 'out',
  packagerConfig: {
    asar: true,
    executableName: 'epic-bos',
    appBundleId: 'com.epicbos.desktop',
    appCategoryType: 'public.app-category.business',
  },
  rebuildConfig: {},
  makers,
  hooks: {
    postMake: async (_forgeConfig, makeResults) => {
      const buildRevision = resolveBuildRevisionSync();
      for (const result of makeResults) {
        if (!['win32', 'darwin', 'linux'].includes(result.platform)) continue;
        for (const artifact of result.artifacts) {
          const artifactPath = path.resolve(artifact);
          if (!statSync(artifactPath).isFile()) continue;
          const artifactBytes = readFileSync(artifactPath);
          const artifactReference = path.relative(process.cwd(), artifactPath).split(path.sep).join('/');
          const productName = String(result.packageJSON.productName ?? result.packageJSON.name ?? 'Epic BOS');
          const version = String(result.packageJSON.version ?? '0.0.0');
          const schemaRevision = getCurrentSchemaRevision();
          const generatedAt = new Date().toISOString();
          const releaseIdentitySha256 = createBuildProvenance(
            { productName, version, platform: result.platform as NodeJS.Platform, buildRevision, schemaRevision },
            generatedAt,
          ).releaseIdentitySha256;
          const manifest = createReleaseArtifactManifest({
            productName,
            version,
            platform: result.platform as 'win32' | 'darwin' | 'linux',
            arch: String(result.arch),
            buildRevision,
            buildEnvironment,
            schemaRevision,
            releaseIdentitySha256,
            artifactReference,
            artifactSha256: createArtifactSha256(artifactBytes),
            generatedAt,
          });
          const manifestPath = `${artifactPath}.manifest.json`;
          mkdirSync(path.dirname(manifestPath), { recursive: true });
          writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
          console.log(`Release artifact manifest written: ${path.relative(process.cwd(), manifestPath)}`);
        }
      }
    },
  },
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
