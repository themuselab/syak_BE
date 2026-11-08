import { User } from '../domain/User';

export interface IReviewAccountRepository {
  consumeAttempt(clientKey: string): Promise<boolean>;
  findAccount(username: string): Promise<{ user: User; passwordHash: string; enabled: boolean } | null>;
}
