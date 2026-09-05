import { UserProfile } from '../domain/UserProfile';

export interface IUserProfileRepository {
  findById(userId: string): Promise<UserProfile | null>;
  updateNickname(userId: string, nickname: string): Promise<void>;
  deleteById(userId: string): Promise<void>;
}
