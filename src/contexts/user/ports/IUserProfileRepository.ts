import { UserProfile } from '../domain/UserProfile';

export interface IUserProfileRepository {
  findById(userId: string): Promise<UserProfile | null>;
  deleteById(userId: string): Promise<void>;
}
