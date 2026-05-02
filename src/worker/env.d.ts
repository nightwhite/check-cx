declare global {
  interface Env {
    CONFIG_ENCRYPTION_KEY?: string;
    INTERNAL_METRICS_TOKEN?: string;
  }
}

export {};
