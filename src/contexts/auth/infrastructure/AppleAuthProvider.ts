import appleSignin from 'apple-signin-auth';
import { ISocialAuthProvider } from '../ports/ISocialAuthProvider';
import { SocialProfile } from '../domain/User';

export class AppleAuthProvider implements ISocialAuthProvider {
  async getProfile(identityToken: string): Promise<SocialProfile> {
    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: process.env.APPLE_TEAM_ID!,
      ignoreExpiration: false,
    });
    return {
      provider: 'apple',
      socialId: payload.sub,
      nickname: null,
      profileImage: null,
    };
  }
}
