import Vue from "vue";
import Vuex from "vuex";
import {
  IMPORT,
  REFRESH_STATE,
  LOCK_WALLET,
  CANCEL_REQUEST,
  CREATE_NEW_WALLET,
  UNLOCK_WALLET,
  AUTHORIZE_REQUEST,
  CONNECT,
  ENCRYPT,
  DECRYPT,
  DISCONNECT,
  ACCESS_LEVEL,
  GET_TOKEN,
  REVEAL_SEED_PHRASE,
  REVEAL_PRIV_KEY,
  UPDATE_CONNECTED,
  GENERATE_NEW_SEED_PHRASE,
} from "./actions";

const { API } = chrome.extension.getBackgroundPage();

Vue.use(Vuex);

export default new Vuex.Store({
  //initial state
  state: {
    address: API.getState().address,
    completedOnboarding: API.getState().initialized,
    connections: API.getState().connections,
    connected: false,
    initialized: API.getState().initialized,
    identities: API.getState().identities,

    credentials: [],
    // [
    //   { id: 0, name: "CC_PT", data: "DATA", expDate: "16 09 2019" },
    //   { id: 1, name: "CC_PT", expDate: "16 09 2021" },
    //   { id: 2, name: "SHUFTI_CC_US", expDate: "27 10 2020" },
    //   { id: 3, name: "CMD_PT", pending: true },
    // ],
    request: API.getNextRequest(),
    debug: null,
    unlocked: API.getState().unlocked,
  },
  getters: {
    address: (state) => state.address,
    completedOnboarding: (state) => state.completedOnboarding,
    connections: (state) => state.connections,
    connected: (state) => state.connected,
    getRequest: (state) => state.request,
    unlocked: (state) => state.unlocked,
    state: (state) => state,
    identities: (state) => state.identities,
    credentials: (state) => state.credentials,
  },
  actions: {
    // []: ({ commit, state }) => {
    //   return new Promise((resolve, reject) => {
    //     API.currentTab(resolve);
    //   }).then((site) => {
    //     state.debug("Current site: ", site);
    //     state.debug("Existing connections: ", state.connections);
    //     if (state.connections) {
    //       let connectedSite = state.connections.find((e) => {
    //         return state.getDomain(e.url) == state.getDomain(site.url) ? e : "";
    //       });
    //       if (connectedSite) {
    //         commit("updateConnected", connectedSite);
    //       }
    //     }
    //   });
    // },

    [UPDATE_CONNECTED]: ({ commit, state }) => {
      return new Promise((resolve, reject) => {
        API.currentTab(resolve);
      }).then((site) => {
        state.debug("Current site: ", site);
        state.debug("Existing connections: ", state.connections);
        if (state.connections) {
          let connectedSite = state.connections.find((e) => {
            return state.getDomain(e.url) == state.getDomain(site.url) ? e : "";
          });
          if (connectedSite) {
            commit("updateConnected", connectedSite);
          }
        }
      });
    },

    [ACCESS_LEVEL]: ({ commit, state }, { url, level }) => {
      return new Promise((resolve, reject) => {
        API.accessControl(url, level).then((res) => {
          resolve(res);
        });
      });
    },

    [GET_TOKEN]: ({ commit, state }, { idt, operation }) => {
      return new Promise((resolve, reject) => {
        console.log("Action GET_TOKEN");
        state.debug("Data: ", idt, operation);
        API.getAuthorizationToken(idt, operation)
          .then((res) => {
            console.log(res);
            resolve(res);
          })
          .catch((e) => {
            console.error(e);
            reject(e);
          });
      });
    },

    [CREATE_NEW_WALLET]: ({ commit, dispatch }, { seed, password }) => {
      console.log("Action CREATE_NEW_WALLET");
      return new Promise((resolve, reject) => {
        API.createNewVault(seed, password)
          .then((res) => {
            dispatch(REFRESH_STATE);
          })
          .then(() => resolve(seed))
          .catch((e) => {
            reject(e);
          });
      });
    },

    [GENERATE_NEW_SEED_PHRASE]: ({ commit, dispatch }, password) => {
      console.log("Action GENERATE_NEW_SEED_PHRASE");
      return new Promise((resolve, reject) => {
        let seed = API.generateSeedPhrase();
        resolve(seed);
      });
    },

    [REVEAL_SEED_PHRASE]: ({ commit, dispatch }, password) => {
      console.log("Action REVEAL_SEED_PHRASE");
      return new Promise((resolve, reject) => {
        API.verifyPassword(password)
          .then((result) => {
            if (result) {
              resolve(API.getState().mnemonic());
            } else {
              reject("Wrong Password");
            }
          })
          .catch((e) => {
            reject(e);
          });
      });
    },

    [REVEAL_PRIV_KEY]: ({ commit, dispatch }, password) => {
      console.log("Action REVEAL_PRIV_KEY");
      return new Promise((resolve, reject) => {
        API.verifyPassword(password)
          .then((result) => {
            if (result) {
              resolve(API.getState().key());
            } else {
              reject("Wrong Password");
            }
          })
          .catch((e) => {
            reject(e);
          });
      });
    },
    [REFRESH_STATE]: ({ commit, dispatch }) => {
      console.log("Action REFRESH_STATE");
      commit("updateAddress", API.getState().address);
      commit("updateUnlocked", API.getState().unlocked);
      commit("updateConnections", API.getState().connections);
      commit("updateOnboarding", API.getState().initialized);
      commit("updateIdentities", API.getState().identities);
      dispatch(UPDATE_CONNECTED);
      // Add Refresh connection ( function on MainContainer.vue created() )
    },

    [CONNECT]: ({ commit, state }, { origin, name }) => {
      return new Promise((resolve, reject) => {
        console.log("Action CONNECT");
        state.debug("URL: ", origin);
        state.debug("Connections: ", state.connections);
        // state.debug("Notification: ", state.notification);
        let icon = origin + "/favicon.ico";
        API.approveConnection(origin, icon, name)
          .then((res) => {
            resolve(res);
          })
          .catch((e) => {
            console.error(e);
            reject(e);
          });
      });
    },
    [ENCRYPT]: ({ commit, state }, { data }) => {
      return new Promise((resolve, reject) => {
        console.log("Action ENCRYPT");
        state.debug("Data: ", data);
        API.encryptData(data)
          .then((res) => {
            resolve(res);
          })
          .catch((e) => {
            console.error(e);
            reject(e);
          });
      });
    },

    [IMPORT]: ({ commit, state }, { idt, data, ow = true, expDate }) => {
      return new Promise((resolve, reject) => {
        console.log("Action IMPORT");
        state.debug("idt: ", idt);
        state.debug("Data: ", data);
        state.debug("ow: ", ow);

        API.importIdentity_v2(idt, data, ow, expDate)
          .then((res) => {
            resolve(res);
          })
          .catch((e) => {
            console.error(e);
            reject(e);
          });
      });
    },
    [DECRYPT]: ({ commit, state }, { data }) => {
      return new Promise((resolve, reject) => {
        console.log("Action DECRYPT");
        state.debug("Data: ", data);
        API.decryptData(data)
          .then((res) => {
            console.log(res);
            resolve(res);
          })
          .catch((e) => {
            console.error(e);
            reject(e);
          });
      });
    },

    [AUTHORIZE_REQUEST]: (
      { state, commit, dispatch },
      { data, type, callback, origin }
    ) => {
      return new Promise((resolve, reject) => {
        console.log("Action AUTHORIZE_REQUEST");
        state.debug("Params: ", data);
        state.debug("Type: ", type);
        state.debug("Origin: ", origin);

        commit("clearPendingRequests");

        switch (type) {
          case "wallid_token":
            dispatch(GET_TOKEN, { idt: data[0], operation: data[1] }).then(
              (res) => {
                console.log(res);
                resolve(callback(null, res));
              }
            );
            break;
          case "wallid_connect":
            dispatch(CONNECT, { origin }).then((res) => {
              console.log(res);
              resolve(callback(null, res));
            });
            break;

          case "wallet_encrypt":
            dispatch(ENCRYPT, { data }).then((res) => {
              console.log(res);
              resolve(callback(null, res));
            });
            break;

          case "wallet_decrypt":
            dispatch(DECRYPT, { data }).then((res) => {
              let _res = JSON.parse(res);
              resolve(callback(null, _res));
            });
            break;

          case "wallid_import":
            dispatch(IMPORT, {
              idt: data.idt,
              data: data.data,
              expDate: data.expDate,
            })
              .then((res) => {
                console.log("res import:", res);
                resolve(callback(null, true));
              })
              .catch(() => resolve(callback("REJECTED")));

            break;

          default:
            break;
        }
      })
        .then(() => {
          dispatch(REFRESH_STATE);
          state.debug("Connections: ", state.connections);
        })
        .catch((err) => {
          throw err;
        });
    },
    [CANCEL_REQUEST]: (
      { commit, dispatch, state },
      { request, notification, callback }
    ) => {
      return new Promise((resolve, reject) => {
        console.log("Action CANCEL_REQUEST", callback);
        resolve(callback("REJECTED"));

        commit("updatePendingRequests");
        dispatch(REFRESH_STATE);
      });
    },

    [DISCONNECT]: ({ commit, state }, url) => {
      return new Promise((resolve, reject) => {
        console.log("Action DISCONNECT");
        state.debug("URL: ", url);
        state.debug("Connections: ", state.connections);

        API.removeConnected(url)
          .then(() => {
            commit("updateConnections", API.getState().connections);
            if (url == state.connected.url) {
              commit("updateConnected", false);
            }
            resolve();
          })
          .catch((e) => {
            console.error("Error Disconnecting site: ", e);
            resolve(state.connections.shift());
          });
      });
    },
    [UNLOCK_WALLET]: ({ commit, dispatch }, password) => {
      return new Promise((resolve, reject) => {
        console.log("Action UNLOCK_WALLET");
        API.verifyPassword(password).then((res) => {
          if (res) {
            API.unlockApp(password)
              .then(() => resolve(dispatch(REFRESH_STATE)))
              .catch((e) => {
                reject(e);
              });
          } else {
            reject("Wrong password");
          }
        });
      });
    },
    [LOCK_WALLET]: ({ commit, dispatch }) => {
      console.log("Action LOCK_WALLET");
      API.lockApp().then(() => dispatch(REFRESH_STATE));
    },
  },
  mutations: {
    updateIdentities(state, value) {
      state.identities = value;
    },
    updateOnboarding(state, value) {
      state.completedOnboarding = value;
    },
    updateConnected(state, value) {
      console.log("store", value);
      state.connected = value;
    },
    updateConnections(state, value) {
      state.connections = value;
    },
    clearPendingRequests(state) {
      state.request = null;
    },
    updatePendingRequests(state) {
      state.request = API.getNextRequest();
    },
    updateAddress(state, value) {
      state.address = value;
    },
    updateUnlocked(state, value) {
      state.unlocked = value;
    },
    appendLogger(state, logger) {
      state.debug = logger;
    },
    appendgetDomain(state, getDomain) {
      state.getDomain = getDomain;
    },
  },
});
