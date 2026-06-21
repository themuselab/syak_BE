import { SocialProfile } from '../domain/User';

export interface ISocialAuthProvider {
  getProfile(accessToken: string): Promise<SocialProfile>;
}
