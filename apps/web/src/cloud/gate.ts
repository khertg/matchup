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
