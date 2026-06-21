import { SocialProvider } from '../../auth/domain/User';

export interface UserProfile {
  id: string;
  linkedProviders: SocialProvider[];
  nickname: string | null;
  profileImage: string | null;
  createdAt: Date;
}
