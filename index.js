const dotenv = require('dotenv');

const SteamCommunity = require('steamcommunity');
const TradeOfferManager = require('steam-tradeoffer-manager');
const FS = require('fs');

dotenv.config();

let community = new SteamCommunity();
let manager = new TradeOfferManager({
  language: 'en',
  pollInterval: Number.parseInt(process.env.POLLING_INTERVAL || 10) * 1000,
});

console.log(
  '[WARNING] After this message all console output will be redirected to the file log.txt for better auditing. This file gets overwritten every time a new session is started so remember to back it up.'
);

let logAccess = FS.createWriteStream('log.txt');
process.stdout.write = process.stderr.write = logAccess.write.bind(logAccess);

console.log(new Date().toString());
console.log(`Starting new session`);

const communityLogin = (logOnOptions) => {
  community.login(logOnOptions, (err, sessionID, cookies, steamguard) => {
    if (err) {
      console.log('Steam login fail: ' + err.message);
      process.exit(1);
    }

    FS.writeFileSync('steamguard.txt', steamguard);

    console.log('Logged into Steam');

    manager.setCookies(cookies, (err) => {
      if (err) {
        console.log(err);
        process.exit(1);
      }
    });
    community.setCookies(cookies);
  });
};

process.stdin.on('data', (data) => {
  let totpCode = data.toString();

  let logOnOptions = {
    accountName:
      process.env.ACCOUNT_NAME ||
      '[ERROR] please specify an ACCOUNT_NAME in your .env file!',
    password:
      process.env.PASSWORD ||
      '[ERROR] please specify an PASSWORD in your .env file!',
    twoFactorCode: totpCode,
  };

  if (FS.existsSync('steamguard.txt')) {
    logOnOptions.steamguard =
      FS.readFileSync('steamguard.txt').toString('utf8');
  }

  if (FS.existsSync('polldata.json')) {
    manager.pollData = JSON.parse(
      FS.readFileSync('polldata.json').toString('utf8')
    );
  }

  communityLogin(logOnOptions);
});

community.on('sessionExpired', (err) => {
  console.log(`Session expired. Relogging...`);

  let logOnOptions = {
    accountName:
      process.env.ACCOUNT_NAME ||
      '[ERROR] please specify an ACCOUNT_NAME in your .env file!',
    password:
      process.env.PASSWORD ||
      '[ERROR] please specify an PASSWORD in your .env file!',
  };

  if (FS.existsSync('steamguard.txt')) {
    logOnOptions.steamguard =
      FS.readFileSync('steamguard.txt').toString('utf8');
  }

  if (FS.existsSync('polldata.json')) {
    manager.pollData = JSON.parse(
      FS.readFileSync('polldata.json').toString('utf8')
    );
  }

  communityLogin(logOnOptions);
});

manager.on('newOffer', (offer) => {
  console.log(
    `New Offer ${offer.id} from ${offer.partner.getSteam3RenderedID()}`
  );
  if (offer.itemsToGive.length == 0) {
    offer.accept((err, status) => {
      if (err) {
        console.log('Unable to accept offer: ' + err.message);
      } else {
        console.log('Offer accepted: ' + status);
        if (status == 'pending') {
          community.acceptConfirmationForObject(
            'identitySecret',
            offer.id,
            (err) => {
              if (err) {
                console.log("Can't confirm trade offer: " + err.message);
              } else {
                console.log(`Trade offer ${offer.id} confirmed`);
              }
            }
          );
        }
      }
    });
  }
});

manager.on('receivedOfferChanged', (offer, oldState) => {
  console.log(
    `Offer #${offer.id} changed: ${
      TradeOfferManager.ETradeOfferState[oldState]
    } -> ${TradeOfferManager.ETradeOfferState[offer.state]}`
  );
  if (offer.state == TradeOfferManager.ETradeOfferState.Accepted) {
    offer.getExchangeDetails(
      (err, status, tradeInitTime, receivedItems, sentItems) => {
        if (err) {
          console.log('Error: ' + err);
          return;
        }

        let newReceivedItems = receivedItems.map((item) => item.new_assetid);
        console.log(`Received items: ${newReceivedItems.join(', ')}`);
      }
    );
  }
});

manager.on('pollData', (pollData) => {
  FS.writeFileSync('polldata.json', JSON.stringify(pollData));
});
