// Dynamic layer over app.json. Static keys stay in app.json; anything that varies
// per environment is applied here, switched by APP_VARIANT (set per EAS profile).
// Both files merge and this one wins.
//
// The bundle identifier / package stay IDENTICAL across variants on purpose —
// OTA and store identity depend on them. Vary environments by EAS channel, not app id.

const VARIANT = process.env.APP_VARIANT ?? "production";

module.exports = ({ config }) => ({
  ...config,
  name: VARIANT === "production" ? config.name : `${config.name} (${VARIANT})`,
  extra: {
    ...config.extra,
    appVariant: VARIANT,
  },
});
