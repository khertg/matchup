export interface GateInput {
  /** Whether a cloud API is configured for this build. */
  cloudConfigured: boolean
  signedIn: boolean
  /** The public live page never needs a login. */
  isViewerPath: boolean
}

/**
 * Whether staff must log in to a club before using the app. Only when a cloud is set up (without
 * one there is nothing to log in to), and never for the public live page.
 */
export const requiresLogin = ({ cloudConfigured, signedIn, isViewerPath }: GateInput): boolean =>
  cloudConfigured && !signedIn && !isViewerPath

export interface DeviceGateInput extends GateInput {
  /** The club signed in now. */
  clubSlug: string | null
  /** The club this device's name is registered with, if any. */
  namedFor: string | null
  /** Naming needs the server (names are unique within the club); an offline device carries on unnamed. */
  online: boolean
}

/**
 * Whether a signed-in device must be given a name before it is used, so the club's activity log can tell
 * its devices apart (two identical phones look the same otherwise). Asked once per club, while online.
 */
export const requiresDeviceName = ({ clubSlug, namedFor, online, ...gate }: DeviceGateInput): boolean =>
  gate.cloudConfigured && gate.signedIn && !gate.isViewerPath && online && clubSlug !== null && namedFor !== clubSlug
