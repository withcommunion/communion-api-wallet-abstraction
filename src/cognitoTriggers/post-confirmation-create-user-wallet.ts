import type {
  PostConfirmationTriggerEvent,
  PostConfirmationTriggerHandler,
} from 'aws-lambda';

export const handler: PostConfirmationTriggerHandler = async (
  event: PostConfirmationTriggerEvent
) => {
  const { request } = event;
  const { userAttributes } = request;
  const user = {
    id: `${userAttributes.sub}`,
    email: userAttributes.email,
    firstName: userAttributes['given_name'],
    lastName: userAttributes['family_name'],
    organization: userAttributes['custom:organization'],
  };

  try {
    console.log('Received user', userAttributes);
    console.log('Attempting to create user', { user });

    return event;
  } catch (error) {
    // Don't throw error.  We don't want to block a user from signing in because of this
    console.error('Failed to save user', error);
  }

  return event;
};
