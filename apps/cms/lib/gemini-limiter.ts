/**
 * Gemini Rate Limiter
 * Respects GEMINI_API_RPM (Requests Per Minute) and GEMINI_API_TPM (Tokens Per Minute)
 */

class GeminiRateLimiter {
  private rpmLimit: number;
  private tpmLimit: number;

  private requestHistory: number[] = []; // Timestamps of requests
  private tokenHistory: { timestamp: number; tokens: number }[] = [];

  private queue: (() => void)[] = [];

  constructor() {
    this.rpmLimit = parseInt(process.env.GEMINI_API_RPM || '10', 10);
    this.tpmLimit = parseInt(process.env.GEMINI_API_TPM || '10000', 10);

    console.log(`GeminiRateLimiter initialized with RPM: ${this.rpmLimit}, TPM: ${this.tpmLimit}`);
  }

  public getRPMLimit(): number { return this.rpmLimit; }
  public getTPMLimit(): number { return this.tpmLimit; }

  /**
   * Estimates tokens from character count.
   * Gemini heuristic: ~4 chars per token, so 0.25 tokens per character.
   */
  public estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.ceil(text.length * 0.25);
  }

  private cleanHistory() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;

    this.requestHistory = this.requestHistory.filter(ts => ts > oneMinuteAgo);
    this.tokenHistory = this.tokenHistory.filter(item => item.timestamp > oneMinuteAgo);
  }

  private getCurrentRPM(): number {
    this.cleanHistory();
    return this.requestHistory.length;
  }

  private getCurrentTPM(): number {
    this.cleanHistory();
    return this.tokenHistory.reduce((sum, item) => sum + item.tokens, 0);
  }

  /**
   * Returns a string summarizing the current usage vs limits.
   */
  public getStatusString(estimatedNextTokens: number = 0): string {
    if (this.rpmLimit <= 0 && this.tpmLimit <= 0) return "No limits";

    const rpm = this.getCurrentRPM();
    const tpm = this.getCurrentTPM();

    let status = `RPM: ${rpm}/${this.rpmLimit}`;
    if (this.tpmLimit > 0) {
      status += `, TPM: ${tpm + estimatedNextTokens}/${this.tpmLimit}`;
    }
    return status;
  }

  /**
   * Acquires permission to make a request. Waits if limits are reached.
   */
  public async acquire(estimatedTokens: number = 0): Promise<void> {
    // If no limits defined, proceed immediately
    if (this.rpmLimit <= 0 && this.tpmLimit <= 0) return;

    while (true) {
      this.cleanHistory();

      const currentRPM = this.getCurrentRPM();
      const currentTPM = this.getCurrentTPM();

      const rpmOk = this.rpmLimit <= 0 || currentRPM < this.rpmLimit;
      const tpmOk = this.tpmLimit <= 0 || (currentTPM + estimatedTokens) <= this.tpmLimit;

      if (rpmOk && tpmOk) {
        // Record usage
        const now = Date.now();
        this.requestHistory.push(now);
        this.tokenHistory.push({ timestamp: now, tokens: estimatedTokens });
        return;
      }

      // Wait a bit and try again. 
      // More sophisticated implementations would calculate the exact wait time.
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  /**
   * After receiving a response, we can update the actual token count if available.
   * Since we are using REST and character count is a good enough proxy, 
   * we'll stick to estimation for now unless we see explicit usage in response.
   */
  public recordActualUsage(actualTokens: number) {
    // Optional refinement
  }
}

// Global singleton
export const geminiLimiter = new GeminiRateLimiter();
