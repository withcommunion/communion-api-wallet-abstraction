import twilio from 'twilio';

/**
 * Twilio creds are in LastPass
 * Go to twilio.com/console to find these values
 */
const accountSid = 'AC758f74a7003621201e5fe2d3b0bc7390';
const authToken = process.env.TWILIO_API_KEY;

const client = twilio(accountSid, authToken);

export async function sendSms(to: string, body: string) {
  try {
    const res = await client.messages.create({
      body,
      to,
      from: '+19205261237', // From a valid Twilio number
    });
    console.log(res);
    return res;
  } catch (error) {
    console.log(error);
  }
}
