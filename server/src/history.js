// What is on the public record about a well-known extension's owner, for the
// checker's pages. Only dated, sourced facts: no verdicts, nothing we can't link.
// Each note says when it was last checked against its sources.
const HISTORY = {
  bmnlcjabgnpnenekpadlanbbkooimhnj: {
    name: 'Honey',
    checked: '2026-11-26',
    items: [
      { when: 'December 2024', text: 'Content creators accused Honey, which is owned by PayPal, of replacing their affiliate links with its own.' },
      { when: 'March 2025', text: 'Google added a Chrome Web Store rule that bans injecting affiliate links without a related user action and a clear benefit to the user. Honey then added an affiliate disclosure to its listing.' },
    ],
    sources: [
      { label: '9to5Google on the new policy', url: 'https://9to5google.com/2025/03/11/google-chrome-affiliate-extension-policy-honey/' },
      { label: '9to5Google on the listing disclosure', url: 'https://9to5google.com/2025/03/12/honey-affiliate-disclosure-google-chrome-listing/' },
    ],
  },
  hdokiejnpimakedhajhdlcegeplioahd: {
    name: 'LastPass',
    checked: '2026-11-26',
    items: [
      { when: 'December 2022', text: 'LastPass said an intruder had copied a backup of customer vault data. Website addresses were stored unencrypted. Usernames, passwords and notes were encrypted, so the main risk was guessing of weak master passwords.' },
    ],
    sources: [
      { label: 'LastPass notice of the incident', url: 'https://blog.lastpass.com/posts/2022/12/notice-of-recent-security-incident' },
      { label: 'TechCrunch', url: 'https://techcrunch.com/2022/12/22/lastpass-customer-password-vaults-stolen/' },
    ],
  },
  gighmmpiobklfepjocnamgkkbiglidom: {
    name: 'AdBlock',
    checked: '2026-11-26',
    items: [
      { when: 'October 2015', text: 'AdBlock, with over 40 million users, was sold to a buyer who was not named. Its creator said he would have no further role, and the update turned on "Acceptable Ads".' },
      { when: 'April 2021', text: 'eyeo, the company behind Adblock Plus, announced it had bought AdBlock.' },
    ],
    sources: [
      { label: 'The Next Web, 2015', url: 'https://thenextweb.com/news/trust-us-we-block-ads' },
      { label: 'Engadget, 2015', url: 'https://www.engadget.com/2015-10-02-adblock-chrome-extension-sold.html' },
      { label: 'Wikipedia: AdBlock', url: 'https://en.wikipedia.org/wiki/AdBlock' },
    ],
  },
};

export const historyFor = (id) => HISTORY[id] ?? null;
