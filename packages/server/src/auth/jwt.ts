import { SignJWT, jwtVerify, type JWTPayload } from 'jose'
import { z } from 'zod'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET!)
const REFRESH_SECRET = new TextEncoder().encode(process.env.REFRESH_SECRET!)

export const TokenPayload = z.object({
  userId: z.string(),
  email: z.string(),
  role: z.string().optional(),
  iat: z.number().optional(),
  exp: z.number().optional()
})

export type TokenPayload = z.infer<typeof TokenPayload>

export class JWTService {
  static async generateTokens(payload: Omit<TokenPayload, 'iat' | 'exp'>) {
    const accessToken = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('15m')
      .sign(JWT_SECRET)

    const refreshToken = await new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(REFRESH_SECRET)

    return { accessToken, refreshToken }
  }

  static async verifyAccessToken(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET)
      return TokenPayload.parse(payload)
    } catch (error) {
      console.error('Access token verification failed:', error)
      return null
    }
  }

  static async verifyRefreshToken(token: string): Promise<TokenPayload | null> {
    try {
      const { payload } = await jwtVerify(token, REFRESH_SECRET)
      return TokenPayload.parse(payload)
    } catch (error) {
      console.error('Refresh token verification failed:', error)
      return null
    }
  }

  static async refreshTokens(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken)
    if (!payload) return null

    // Generate new tokens with same payload (minus iat/exp)
    const { iat, exp, ...tokenData } = payload
    return this.generateTokens(tokenData)
  }
}