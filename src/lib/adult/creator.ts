import {type AppBskyActorDefs} from '@atproto/api'

/**
 * Creator is a role/capability on top of an AQUA Identity — never a second
 * account. This adapter projects the public AT profile into the +18 creator
 * surface. Fields that don't exist yet on the network stay undefined instead
 * of being faked: real values arrive with creator verification (Trust &
 * Safety) and the economy layer (FASE 8).
 */
export type AdultCreatorVerification =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'suspended'

export type AdultCreatorProfile = {
  userId: string
  handle: string
  displayName?: string
  bio?: string
  avatar?: string
  banner?: string
  verificationStatus: AdultCreatorVerification
  subscriptionEnabled: boolean
  ppvEnabled: boolean
  followersCount?: number
  subscribersCount?: number
  mediaCount?: number
  createdAt?: string
}

export function toAdultCreatorProfile(
  profile: AppBskyActorDefs.ProfileViewDetailed,
): AdultCreatorProfile {
  return {
    userId: profile.did,
    handle: profile.handle,
    displayName: profile.displayName,
    bio: profile.description,
    avatar: profile.avatar,
    banner: profile.banner,
    // No on-network creator verification exists yet — everyone starts here.
    verificationStatus: 'unverified',
    subscriptionEnabled: false,
    ppvEnabled: false,
    followersCount: profile.followersCount,
    createdAt: profile.createdAt,
  }
}
