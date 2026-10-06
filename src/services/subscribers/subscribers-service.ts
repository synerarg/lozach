import {
  CreateSubscriberResult,
  SubscribersRepository,
  Subscriber,
} from "@/repositories/subscribers/subscribers-repository"

export class SubscribersService {
  private readonly subscriberRepository: SubscribersRepository

  constructor(subscriberRepository?: SubscribersRepository) {
    this.subscriberRepository =
      subscriberRepository || new SubscribersRepository()
  }

  async getAllSubscribers(): Promise<Subscriber[]> {
    return await this.subscriberRepository.getAllSubscribers()
  }

  async createSubscriber(email: string): Promise<CreateSubscriberResult> {
    return await this.subscriberRepository.createSubscriber(email)
  }

  async unsubscribe(email: string): Promise<void> {
    return await this.subscriberRepository.deleteSubscriberByEmail(email)
  }
}
