import type { EpicBosBridge } from './contracts';

declare global {
  interface Window {
    epicBos: EpicBosBridge;
  }
}

export {};
