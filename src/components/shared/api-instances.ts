"use client";

export const clientInFlightRequests = new Map<string, Promise<unknown>>();

export class ClientAPIQueue {
  private queue: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
  }> = [];
  private running = 0;

  constructor(private readonly maxConcurrent = 3, private readonly minDelay = 300) {}

  add<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        fn,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      void this.process();
    });
  }

  private async process() {
    if (this.running >= this.maxConcurrent) return;
    const item = this.queue.shift();
    if (!item) return;

    this.running += 1;
    await new Promise((resolve) => window.setTimeout(resolve, this.minDelay));
    try {
      item.resolve(await item.fn());
    } catch (error) {
      item.reject(error);
    } finally {
      this.running -= 1;
      void this.process();
    }
  }
}

export const clientAvailabilityQueue = new ClientAPIQueue(8, 150);
