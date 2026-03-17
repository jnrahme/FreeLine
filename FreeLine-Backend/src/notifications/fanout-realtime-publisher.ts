import type { RealtimeEvent, RealtimePublisher } from "./types.js";

export class FanoutRealtimePublisher implements RealtimePublisher {
  constructor(private readonly publishers: RealtimePublisher[]) {}

  async publish(event: RealtimeEvent): Promise<void> {
    await Promise.all(this.publishers.map((publisher) => publisher.publish(event)));
  }
}
