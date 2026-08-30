import appleSignin from 'apple-signin-auth';
import { ISocialAuthProvider } from '../ports/ISocialAuthProvider';
import { SocialProfile } from '../domain/User';

export class AppleAuthProvider implements ISocialAuthProvider {
  async getProfile(identityToken: string): Promise<SocialProfile> {
    // id_token의 aud(client_id) = 웹 Services ID / 앱 번들 ID. (Team ID 아님!)
    // 사장님 웹(Services ID)과 소비자 앱(번들 ID) 둘 다 허용.
    const aud = [process.env.APPLE_SERVICES_ID, process.env.APPLE_BUNDLE_ID].filter(Boolean) as string[];
    const payload = await appleSignin.verifyIdToken(identityToken, {
      audience: aud.length === 1 ? aud[0] : aud,
      ignoreExpiration: false,
    });
    return {
      provider: 'apple',
      socialId: payload.sub,
      nickname: null,      // 애플 id_token엔 이름 없음(최초 form_post에만) → 이후 프로필에서 입력
      profileImage: null,  // 애플은 프로필 이미지 미제공
    };
  }
}
