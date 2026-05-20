declare global {
  interface Env {
    ADMIN_PATH?: string;
    ADMIN_TOKEN?: string;
    CONFIG_ENCRYPTION_KEY?: string;
    INTERNAL_METRICS_TOKEN?: string;
  }
}

export {};
