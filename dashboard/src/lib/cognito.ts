import {
  CognitoUserPool,
  CognitoUser,
  AuthenticationDetails,
  CognitoUserSession,
} from 'amazon-cognito-identity-js';

const poolData = {
  UserPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID || '',
  ClientId: import.meta.env.VITE_COGNITO_CLIENT_ID || '',
};

const userPool = new CognitoUserPool(poolData);

export interface SignInResult {
  session?: CognitoUserSession;
  newPasswordRequired?: boolean;
  user?: CognitoUser;
}

export function getCurrentUser(): CognitoUser | null {
  return userPool.getCurrentUser();
}

export function getSession(): Promise<CognitoUserSession | null> {
  return new Promise((resolve) => {
    const user = getCurrentUser();
    if (!user) {
      resolve(null);
      return;
    }
    user.getSession((err: Error | null, session: CognitoUserSession | null) => {
      if (err) {
        resolve(null);
        return;
      }
      resolve(session);
    });
  });
}

export function signIn(username: string, password: string): Promise<SignInResult> {
  return new Promise((resolve, reject) => {
    const authDetails = new AuthenticationDetails({
      Username: username,
      Password: password,
    });

    const user = new CognitoUser({
      Username: username,
      Pool: userPool,
    });

    user.authenticateUser(authDetails, {
      onSuccess: (session) => resolve({ session }),
      onFailure: (err) => reject(err),
      newPasswordRequired: () => resolve({ newPasswordRequired: true, user }),
    });
  });
}

export function completeNewPassword(user: CognitoUser, newPassword: string): Promise<CognitoUserSession> {
  return new Promise((resolve, reject) => {
    user.completeNewPasswordChallenge(newPassword, {}, {
      onSuccess: (session) => resolve(session),
      onFailure: (err) => reject(err),
    });
  });
}

export function signOut(): void {
  const user = getCurrentUser();
  if (user) {
    user.signOut();
  }
}

export function getUserEmail(): string | null {
  const user = getCurrentUser();
  if (!user) return null;
  return user.getUsername();
}
