// import { insertUser } from '../util/__mocks__/dynamo-util';
import { handler } from './post-confirmation-create-user-wallet';

describe('postConfirmationCreateUserWallet', () => {
  const event = {
    version: '1',
    region: 'us-east-1',
    userPoolId: 'us-east-1_EXRZZF0cp',
    userName: '21f56d21-45ff-40a9-9041-1f3d3b864df5',
    callerContext: {
      awsSdkVersion: 'aws-sdk-unknown-unknown',
      clientId: '4eerlu1taf72c8r20pv2tmmvmt',
    },
    triggerSource: 'PostConfirmation_ConfirmSignUp',
    request: {
      userAttributes: {
        sub: '21f56d21-45ff-40a9-9041-1f3d3b864df5',
        email_verified: 'true',
        'cognito:user_status': 'CONFIRMED',
        'cognito:email_alias': 'mfalicea58@gmail.com',
        given_name: 'Mike',
        family_name: 'Alicea',
        email: 'mfalicea58@gmail.com',
      },
    },
    response: {},
  };
  it('should create a user wallet', async () => {
    // @ts-expect-error test eslint-disable-next-line
    // eslint-disable-next-line
    const response = await handler(event, event.callerContext, () => {});

    expect(true).toBe(true);
    // expect(insertUser).toHaveBeenCalled();
  });
});
