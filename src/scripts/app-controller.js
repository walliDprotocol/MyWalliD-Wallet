'use strict';

import StateStore from './lib/store';
import * as seed from './lib/seed-phrase';
import { getRequestDetails } from './lib/requests';
import * as WalliD from './lib/wallid';
import launchNotificationPopup from './lib/launch-notification-popup';
import { eventPipeIn } from './lib/event-pipe';
import VaultController from './controllers/vault';
import WalletController from './controllers/wallet';
import ConnectionsController from './controllers/connections';
import IdentitiesController from './controllers/identities';
import CredentialsController from './controllers/credentials';
import ProfilesController from './controllers/profiles';

import ConfigurationsController from './controllers/configuration';

import walletConnectController from './controllers/walletConnectController';

import { ethers } from 'ethers';
import { setProvider } from './lib/eth-utils';

const provider = new ethers.providers.JsonRpcProvider(
  'https://mainnet.infura.io/v3/463ed0e7b23c41178adf46fd4fbbc7c2'
);

const InitState = {
  wallet: {},
  connections: {},
  identities: {},
  credentials: {},
  profiles: {},
  configurations: {},
  password: '',
  popups: [],
  requests: [],
};

export default class AppController {
  #store;

  constructor() {
    console.log('NEW APP CONTroLER');
    this.#store = new StateStore(InitState);
    const vault = new VaultController();
    vault.loadFromLocalStorage();
    this.#store.updateState({ vault });

    // Initialize Wallet Connect controller
    const walletConnect = new walletConnectController();

    this.#store.updateState({ walletConnect });
  }

  //=============================================================================
  // WalletConnect Interface
  //=============================================================================

  /**
   *
   */
  initFromURI(uri) {
    const vault = this.#store.getState().vault;
    const walletConnect = this.#store.getState().walletConnect;
    const wallet = this.#store.getState().wallet;

    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    return Promise.resolve(walletConnect.initFromURI(uri, wallet.getAddress()))
      .then(() => eventPipeIn('wallid_wallet_connect_init'))
      .then(() => wallet.getAddress());
  }

  /**
   *
   */
  approveSession() {
    const vault = this.#store.getState().vault;
    const walletConnect = this.#store.getState().walletConnect;
    const wallet = this.#store.getState().wallet;

    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    return Promise.resolve(walletConnect.approveSession())
      .then(({ url, icons, name }) =>
        this.approveConnection(url, icons?.[0], name, 0)
      )
      .then(() => eventPipeIn('wallid_wallet_connect_approved'))
      .then(() => wallet.getAddress());
  }
  //=============================================================================
  // APP CONTROLLER INTERFACE
  //=============================================================================

  //
  // ONBOARDING RELATED METHODS
  //

  /**
   * Returns a randomly generated, 12 word mnemonic phrase according to BIP39.
   *
   * @returns {string} - seedphrase
   */
  generateSeedPhrase() {
    return seed.generate();
  }

  /**
   * Checks if provided string matches the currently stored mnemonic phrase.
   * Validates string against BIP39.
   * Promise rejects if vault is locked.
   *
   * @param {string} - test
   *
   * @returns {Promise<boolean>} - valid
   */
  validateSeedPhrase(test) {
    if (!this.isUnlocked()) {
      Promise.reject('Vault is locked');
    }
    let mnemonic = this.#store.getState().mnemonic;
    return Promise.resolve(seed.validate(test) && mnemonic == test);
  }

  isOnboardingComplete() {
    return { initialized: !this.#store?.getState()?.vault?.isEmpty() };
  }

  //
  // VAULT CONTROLLER INTERFACE
  //

  /**
   * Creates a new vault with @password, persisting it to local storage.
   * Creates a new wallet from the provided @mnemonic.
   * Overwrites any pre-existing data.
   *
   * @param {string} - mnemonic
   * @param {string} - password
   *
   * @returns {Promise}
   */
  createNewVault(mnemonic, password) {
    const vault = this.#store.getState().vault;
    return Promise.resolve(vault.createNewAndPersist(mnemonic, password))
      .then(() => {
        eventPipeIn('wallid_wallet_created');
      })
      .catch((err) => console.error(err));
  }

  /**
   * Resets the vault and clears plugin's local storage.
   * This action is definitive. All plugin data is permanently lost.
   * Throws error if plugin is locked.
   *
   * @returns {Promise}
   */
  resetVault() {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      Promise.reject('Vault is locked');
    }
    return Promise.resolve(
      vault.submitPassword(this.#store.getState().password)
    )
      .then(vault.fullReset())
      .then(() => this.#store.updateState(InitState));
  }

  /**
   * Tries to unlock the App with provided password.
   * Loads wallet, connections and password to runtime state.
   * Throws error if provided password is incorrect.
   *
   * @param {string} password
   *
   * @returns {Promise}
   */
  unlockApp(password) {
    const vault = this.#store.getState().vault;
    if (vault.isEmpty()) {
      return Promise.reject('Vault is empty!');
    }
    return Promise.resolve(vault.unlock(password))
      .then(() =>
        this.#store.updateState({
          wallet: WalletController.deserialize(vault.getWallet()),
          connections: ConnectionsController.deserialize(
            vault.getConnections()
          ),
          identities: IdentitiesController.deserialize(vault.getIdentities()),
          credentials: CredentialsController.deserialize(
            vault.getCredentials()
          ),
          profiles: ProfilesController.deserialize(vault.getProfiles()),
          configurations: new ConfigurationsController(),
          password,
        })
      )
      .then(() => {
        setProvider(this.#store.getState().configurations.getProvider());
        this.#store.getState().walletConnect.initFromSession();
        return this.setENSData(this.#store.getState().wallet.getAddress());
      })
      .then(() => {
        eventPipeIn('wallid_event_unlock');
        return true;
      })
      .catch((err) => {
        console.error(err);
        return Promise.reject('Wrong password');
      });
  }

  setENSData(address) {
    console.log(address);
    return Promise.resolve()
      .then(() => provider.lookupAddress(address))
      .then((domain) => {
        this.#store.updateState({ domainENS: domain });
        if (domain) {
          return provider.getResolver(domain);
        }
        return;
      })
      .then((resolver) => resolver?.getAvatar())
      .then((avatar) => this.#store.updateState({ avatarENS: avatar?.url }));
  }

  /**
   * Locks the app and clears app's runtime state.
   * App's state is wiped clean and vault is locked.
   *
   * @returns {Promise}
   */
  lockApp() {
    const vault = this.#store.getState().vault;
    return Promise.resolve(vault.lock())
      .then(() => this.#store.updateState(InitState))
      .then(() => eventPipeIn('wallid_event_lock'));
  }

  /**
   * Tries to unlock vault with @password.
   * Resolves to true in case password is valid and to false otherwise.
   *
   * @param {string} password
   *
   * @returns {Promise<boolean>} - verified
   */
  verifyPassword(password) {
    const vault = this.#store.getState().vault;
    return Promise.resolve(vault.submitPassword(password))
      .then(() => Promise.resolve(true))
      .catch(() => Promise.resolve(false));
  }

  //
  // CONNECTIONS CONTROLLER INTERFACE
  //
  /**
   * Approves a pending connection request.
   * Promise rejects if a connection with same @url already exists, or if vault is locked.
   *
   * @param {string} url - Identifier of the pendding connection
   *
   * @returns {Promise} - result
   */
  approveConnection(url, icon, name, level = 1) {
    const vault = this.#store.getState().vault;
    const connections = this.#store.getState().connections;
    const wallet = this.#store.getState().wallet;

    console.log('approveConnection');

    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    return Promise.resolve(connections.addConnected(url, icon, name, level))
      .then(
        vault.putConnections(
          connections.serialize(),
          this.#store.getState().password
        )
      )
      .then(() => eventPipeIn('wallid_wallet_connected'))
      .then(() => wallet.getAddress());
  }

  /**
   * Removes connection identified by @url from list of connected websites.
   * Promise rejects if @url does not match any approved connections, or if vault is locked.
   *
   * @param {string} url - Identifier of the pendding connection
   *
   * @returns {Promise} - result
   */
  removeConnected(url) {
    const vault = this.#store.getState().vault;
    const connections = this.#store.getState().connections;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    return Promise.resolve(connections.removeConnected(url)).then(() => {
      return vault.putConnections(
        connections.serialize(),
        this.#store.getState().password
      );
    });
  }
  /**
   *
   * @param {function} f - callback function
   */
  currentTab(f) {
    var query = { active: true, lastFocusedWindow: true };
    function callback(tabs) {
      var currentTab = tabs[0]; // there will be only one in this array
      f(currentTab);
    }
    chrome.tabs.query(query, callback);
  }

  //
  // CRYPTOGRAPHIC INTERFACE
  //

  /**
   * Signs @data using wallet.
   * Rejects if plugin is locked.
   *
   * @param {*} data - JSON serializable object to be encrypted
   *
   * @returns {Promise<Object>} cipher - Sign data
   */
  signPrivateKey(data) {
    const vault = this.#store.getState().vault;
    const wallet = this.#store.getState().wallet;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    return wallet.signEthereumMessage(JSON.stringify(data));
  }

  /**
   * Encrypts @data using wallet.
   * Rejects if plugin is locked.
   *
   * @param {*} data - JSON serializable object to be encrypted
   *
   * @returns {Promise<Object>} cipher - Ciphered data
   */
  encryptData(data) {
    const vault = this.#store.getState().vault;
    const wallet = this.#store.getState().wallet;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    return wallet.encryptData(JSON.stringify(data));
  }

  /**
   * Tries to decrypt @data using wallet.
   * Rejects if plugin is locked.
   *
   * @param {Object} data - Data as returned by <eth-sig-util>.encrypt method
   *
   * @returns {Promise<*>} cipher - Decrypted JSON serializable data
   */
  decryptData(data) {
    const vault = this.#store.getState().vault;
    const wallet = this.#store.getState().wallet;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    return wallet.decryptData(data);
  }

  /**
   * Generates an ERC191 signature using local wallet.
   * Reject if plugin is locked.
   *
   * @param {*} data - JSON serializable object to be encrypted
   *
   * @returns {Promise<Object>} cipher - Ciphered data
   */
  generateERC191Signature(target, data) {
    const vault = this.#store.getState().vault;
    const wallet = this.#store.getState().wallet;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    return wallet.signERC191Message(target, data);
  }

  /**
   * Generates an eliptic curve signature using wallet.
   * Resolve if plugin is locked.
   *
   * @param {string} data - 32 byte hexadecimal string without '0x' prefix
   *
   * @returns {Promise<Object>} signature - signed data
   */
  generateECSignature(data) {
    const vault = this.#store.getState().vault;
    const wallet = this.#store.getState().wallet;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    return wallet.signECMessage(data);
  }
  //
  // WALLID RELATED METHODS
  //
  /**
   * Returns a list of assets id based on @param {String or Array<String>} listType.
   * @returns {Array<Object> or Array<String>} list of ids (grouped
   *  by controller if listType == 'assets')
   */
  getList(listType) {
    console.log('Get list for: ', listType);
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }

    try {
      if (Array.isArray(listType)) {
        let object = {};
        listType.forEach((type) => Object.assign(object, this.getList(type)));
        console.log('object', object);
        return object;
      }

      switch (listType) {
        case 'assets':
          const currentControllers = ['identities', 'credentials', 'profiles'];
          let object = {};
          currentControllers.forEach((type) =>
            Object.assign(object, this.getList(type))
          );
          console.log('object', object);
          return object;
        default:
          const listController = this.#store.getState()[listType];
          if (!listController)
            return Promise.reject('NOT_IMPLEMENTED: ' + listType);
          console.log(listController.getList());
          return { [listType]: [...listController.getList()] };
      }
    } catch (error) {
      console.error(error);
    }
  }
  /**
   */
  exportAsset(type, idt) {
    console.log('exportAsset for: ', type, idt);
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }

    try {
      const listController = this.#store.getState()[type];
      if (!listController) return Promise.reject('NOT_IMPLEMENTED: ' + type);
      console.log(listController.exportAsset(idt));
      return listController.exportAsset(idt);
    } catch (error) {
      console.error(error);
    }
  }
  /**
   * Returns WalliD authorization token ready for use with WalliD API.
   * Rejects with HTTP status code from server if request fail.
   *
   * @param {string} idt
   * @param {string} operation
   */
  getAuthorizationToken(idt, operation) {
    const wallet = this.#store.getState().wallet;
    return Promise.resolve(
      WalliD.getAuthenticationChallenge(wallet.getAddress(), idt, operation)
    )
      .then(({ ok, status, body }) =>
        ok
          ? wallet
              .signEthereumMessage(body.challenge)
              .then((signature) =>
                WalliD.buildAuthorizationToken_v1(body.challenge, signature)
              )
          : Promise.reject({
              status,
              error: 'ERR_AUTH_TOKEN',
              message: body ? body.message : null,
            })
      )
      .catch((error) => Promise.reject(error));
  }

  /**
   * Retrieves WalliD user's identity data.
   * Rejects with HTTP status code from server if identity doesn't exists, or request fail.
   *
   * @param {string} auth_token - WalliD authorization token
   */
  extractIdentityData_v1(auth_token) {
    return Promise.resolve(
      WalliD.extractIdentity(auth_token)
    ).then(({ ok, status, body }) =>
      ok && status != 202 ? Promise.resolve(body.data) : Promise.reject(status)
    );
  }

  extractIdentityData_v2(id) {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    const identities = this.#store.getState().identities;
    console.log(identities);

    return Promise.resolve(
      identities.extractIdentity(id).catch((err) => Promise.reject(err))
    );
  }

  /**
   * Imports a new identity of type @idt into WalliD Plugin.
   *
   * @param {string} idt - WalliD identity type tag
   * @param {string} data - encrypted identity data
   * @param {*} ow - overwrite flag
   */
  importIdentity_v2(idt, data, ow = false, expDate, idtName) {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    console.log('idtName', idtName);
    const identities = this.#store.getState().identities;
    return Promise.resolve(
      identities.addIdentity(idt, data, ow, expDate, idtName)
    ).then(() =>
      vault.putIdentities(
        identities.serialize(),
        this.#store.getState().password
      )
    );
  }

  /**
   * Imports a new credential with @id into WalliD Plugin.
   *
   * @param {string} id - WalliD credential id
   * @param {string} data - encrypted credential data
   * @param {*} ow - overwrite flag
   */
  importCredential(
    id,
    credName,
    caName,
    photoURL,
    userData,
    status,
    ow = false,
    expDate
  ) {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    const credentials = this.#store.getState().credentials;
    return Promise.resolve(
      credentials.addCredential(
        id,
        credName,
        caName,
        photoURL,
        userData,
        status,
        ow,
        expDate
      )
    ).then(
      vault.putCredentials(
        credentials.serialize(),
        this.#store.getState().password
      )
    );
  }
  /**
   * Exports a credential with @id from WalliD Plugin.
   *
   * @param {string} id - WalliD credential id
   */
  exportCredential(id) {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    const credentials = this.#store.getState().credentials;
    console.log(credentials);

    return Promise.resolve(
      credentials.getCredential(id).catch((err) => Promise.reject(err))
    );
  }
  /**
   * Imports a new credential with @id into WalliD Plugin.
   *
   * @param {string} id - WalliD credential id
   * @param {string} sig - encrypted sig data
   * @param {string} verifySig - encrypted verifySig data
   *
   * @param {*} ow - overwrite flag
   */
  importCredentialSign(id, sig, verifySig) {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    console.log(id);
    const credentials = this.#store.getState().credentials;
    return Promise.resolve(
      credentials.addCredentialSign(id, sig, verifySig)
    ).then(
      vault.putCredentials(
        credentials.serialize(),
        this.#store.getState().password
      )
    );
  }

  /**
   * Deletes a new credential with @id in WalliD Plugin.
   *
   * @param {string} id - WalliD credential id
   */
  deleteCredential(id) {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    console.log(id);
    const credentials = this.#store.getState().credentials;
    return Promise.resolve(credentials.deleteCredential(id)).then(
      vault.putCredentials(
        credentials.serialize(),
        this.#store.getState().password
      )
    );
  }

  /**
   * Deletes a social profile with @id in WalliD Plugin.
   *
   * @param {string} id - WalliD social profile id
   */
  deleteProfile(id) {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    console.log(id);
    const profiles = this.#store.getState().profiles;
    return Promise.resolve(profiles.deleteProfile(id)).then(
      vault.putProfiles(profiles.serialize(), this.#store.getState().password)
    );
  }

  /**
   * Deletes an identity with @idt in WalliD Plugin.
   *
   * @param {string} idt - WalliD identity idt
   */
  deleteIdentity(idt) {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    console.log(idt);
    const identities = this.#store.getState().identities;
    return Promise.resolve(identities.deleteIdentity(idt)).then(
      vault.putIdentities(
        identities.serialize(),
        this.#store.getState().password
      )
    );
  }

  /**
   * Imports a new identity of type @idt into WalliD Plugin.
   *
   * @param {string} id - Social Profile name + username tag
   * @param {string} profileData - social identity data
   * @param {*} ow - overwrite flag
   */
  importSocialProfile(id, profileData, username, socialName, ow = false) {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    console.log('id', id);
    const profiles = this.#store.getState().profiles;
    console.log(profiles);
    return Promise.resolve(
      profiles.addProfile(id, profileData, username, socialName, ow)
    )
      .then(() =>
        vault.putProfiles(profiles.serialize(), this.#store.getState().password)
      )
      .catch((err) => {
        Promise.reject(err);
      });
  }

  /**
   * Exports a  Social profile with @id from WalliD Plugin.
   *
   * @param {string} id - Social profile id
   */
  exportSocialProfilel(id) {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return Promise.reject('ERR_PLUGIN_LOCKED');
    }
    const profiles = this.#store.getState().profiles;
    return Promise.resolve(
      profiles.getCredential(id).catch((err) => Promise.reject(err))
    );
  }

  //
  // PENDING REQUESTS RELATED METHODS
  //

  /**
   * Pushes a new pending request to the App's runtime requests queue.
   * Requests pushed to this queue need user interaction to be handled.
   *
   * @param {Object} _request - Object as generated by the request API
   */
  updatePendingRequests(_request) {
    let requests = this.#store.getState().requests;
    requests.push(_request);
    this.#store.updateState({ requests });
  }

  /**
   * Pops and returns the next request on queue.
   *
   * @returns {Object} request - Object as generated by the request API
   */
  getNextRequest() {
    let requests = this.#store.getState().requests;
    let next = requests.shift();
    this.#store.updateState({ requests });
    return next;
  }

  //
  // NOTIFICATION POPUP RELATED METHODS
  //

  /**
   * Pushes @id to the App's active popups list.
   * If @remove is set, tries to remove @id from the popups list.
   *
   * @param {number} id - ID of active popup window
   * @param {boolean} remove - remove flag
   */
  updateActivePopups(id, remove) {
    let popups = this.#store.getState().popups;
    if (remove) {
      popups.splice(popups.indexOf(id), 1);
    } else {
      popups.push(id);
    }
    this.#store.updateState({ popups });
  }

  /**
   * Returns App's active popups list.
   *
   * @returns {Array<number>} popups - List of currently active popup window IDs
   */
  getActivePopups() {
    return this.#store.getState().popups;
  }

  eventProxy(msg) {
    eventPipeIn(msg);
  }

  //=============================================================================
  // EXPOSED TO THE UI SUBSYSTEM
  //=============================================================================

  /**
   * Returns app controller's state.
   * Allows the UI access to the internal controller state.
   *
   * @returns {Object} uiState
   */
  getState() {
    const vault = this.#store.getState().vault;
    const wallet = this.#store.getState().wallet;
    const connections = this.#store.getState().connections;
    const identities = this.#store.getState().identities;
    const credentials = this.#store.getState().credentials;
    const profiles = this.#store.getState().profiles;
    const domainENS = this.#store.getState().domainENS;
    const avatarENS = this.#store.getState().avatarENS;

    return {
      initialized: !vault.isEmpty(),
      unlocked: vault.isUnlocked(),
      address: vault.isUnlocked() ? wallet.getAddress() : null,
      domainENS: vault.isUnlocked() ? domainENS : null,
      avatarENS: vault.isUnlocked() ? avatarENS : null,

      connections: vault.isUnlocked() ? connections.getAllConnections() : null,
      identities: vault.isUnlocked() ? identities.get() : null,
      credentials: vault.isUnlocked() ? credentials.get() : null,
      profiles: vault.isUnlocked() ? profiles.get() : null,
      mnemonic: vault.isUnlocked() ? () => vault.getMnemonic() : null,
      key: vault.isUnlocked() ? () => vault.getWallet() : null,
    };
  }

  /**
   * Returns an object with the controller's functions.
   * Exposes the controller's functionalities to the UI subsystem.
   *
   * @returns {Object} api
   */
  getAPI() {
    return {
      getState: this.getState.bind(this),
      generateSeedPhrase: this.generateSeedPhrase.bind(this),
      validateSeedPhrase: this.validateSeedPhrase.bind(this),
      createNewVault: this.createNewVault.bind(this),
      resetVault: this.resetVault.bind(this),
      verifyPassword: this.verifyPassword.bind(this),
      unlockApp: this.unlockApp.bind(this),
      lockApp: this.lockApp.bind(this),
      approveConnection: this.approveConnection.bind(this),
      removeConnected: this.removeConnected.bind(this),
      signPrivateKey: this.signPrivateKey.bind(this),
      encryptData: this.encryptData.bind(this),
      decryptData: this.decryptData.bind(this),
      getAuthorizationToken: this.getAuthorizationToken.bind(this),
      extractIdentityData: this.extractIdentityData_v2.bind(this),
      importIdentity_v2: this.importIdentity_v2.bind(this),
      importCredential: this.importCredential.bind(this),
      exportCredential: this.exportCredential.bind(this),
      getNextRequest: this.getNextRequest.bind(this),
      accessControl: this.accessControl.bind(this),
      currentTab: this.currentTab.bind(this),
      generateERC191Signature: this.generateERC191Signature.bind(this),
      generateECSignature: this.generateECSignature.bind(this),
      importCredentialSign: this.importCredentialSign.bind(this),
      deleteCredential: this.deleteCredential.bind(this),
      deleteProfile: this.deleteProfile.bind(this),
      deleteIdentity: this.deleteIdentity.bind(this),

      eventProxy: this.eventProxy.bind(this),

      importSocialProfile: this.importSocialProfile.bind(this),

      initFromURI: this.initFromURI.bind(this),
      approveSession: this.approveSession.bind(this),

      getList: this.getList.bind(this),
    };
  }

  //=============================================================================
  // EXTERNAL REQUEST API
  //=============================================================================

  /**
   * Resolves to a bool indicating if @origin has access level @level .
   *
   * @param {string} origin - url of the caller web site
   * @param {Number} level - request access level
   *
   * @returns {Promise<boolean>} - has access bool
   */
  accessControl(origin, level) {
    const vault = this.#store.getState().vault;
    if (!vault.isUnlocked()) {
      return undefined;
    }
    const connections = this.#store.getState().connections;
    return Promise.resolve(connections.getConnectionAccessLevel(origin)).then(
      (al) => {
        console.log(al);
        return al >= level;
      }
    );
  }

  /**
   * Exposes the extension's functionalities to web applications.
   * This method is called from within background.js.
   * Available methods and respective details are described in lib/requests.js.
   * Available fields for the method objects are defined in lib/requests.js.
   *
   * @param {string} method - name of the method to execute
   * @param {Array} params - array containing the parameters
   * @param string} origin - url of the caller web site
   */
  requestAPIv2(method, params = [], origin) {
    const requestHandler = async function(details) {
      let promise = {};
      try {
        if (details.args && params.length < details.args) {
          return Promise.reject('WRONG_PARAMS');
        }
        // Check if has permission to handle request
        const accessLevel = await this.accessControl(origin, details.level);

        if (accessLevel < 0) {
          return Promise.reject('ERR_NO_PERMISSION');
        }

        console.log('accessControl account: ', accessLevel);
        if (details.main_controller && details.create) {
          return this[details.executor[0]](...params);
        }

        console.log('request details: ', details);
        console.log('request params: ', params);

        // has permission, do request
        if (accessLevel >= details.level && !details.popup) {
          // Check if is to main_controller or for creating account
          if (details.main_controller) {
            promise = this[details.executor[0]](...params);
          } else {
            console.log('state request');
            promise = Promise.resolve(
              this.#store
                .getState()
                [details.executor[0]][details.executor[1]](...params)
            );
          }
        } else {
          // when no permission (or no wallet ???)
          promise = new Promise((resolve, reject) => {
            var _request = {
              origin,
              type: method,
              data: params,
              level: details.level,
              callback: function(err, result) {
                if (err) return reject(err);
                else return resolve(result);
              },
            };
            this.updatePendingRequests(_request);
          });
          launchNotificationPopup().then((id) => this.updateActivePopups(id));
        }
      } catch (error) {
        console.log(error);
      }
      // promise to return
      return promise;
    };

    return Promise.resolve(getRequestDetails(method)).then(
      requestHandler.bind(this)
    );
  }

  /**
   * Exposes the extension's functionalities to web applications.
   * This method is called from within background.js.
   * Available methods and respective details are described in lib/requests.js.
   * Available fields for the method objects are defined in lib/requests.js.
   *
   * @param {string} method - name of the method to execute
   * @param {Array} params - array containing the parameters
   * @param string} origin - url of the caller web site
   */
  requestAPI(method, params = [], origin) {
    const requestHandler = function(details) {
      let promise = {};

      if (details.args && params.length < details.args) {
        return Promise.reject('WRONG_PARAMS');
      }
      if (details.popup) {
        promise = new Promise((resolve, reject) => {
          var _request = {
            origin,
            type: method,
            data: params,
            level: details.level,
            callback: function(err, result) {
              if (err) return reject(err);
              else return resolve(result);
            },
          };
          this.updatePendingRequests(_request);
        });
        launchNotificationPopup().then((id) => this.updateActivePopups(id));
      } else if (details.main_controller && details.create) {
        promise = this[details.executor[0]](...params);
      } else if (details.main_controller) {
        const vault = this.#store.getState().vault;
        if (!vault.isUnlocked()) {
          promise = Promise.reject('ERR_PLUGIN_LOCKED');
        } else {
          promise = Promise.resolve(
            this.accessControl(origin, details.level)
          ).then((acc) =>
            acc
              ? this[details.executor[0]](...params)
              : Promise.reject('ERR_NO_PERMISSION')
          );
        }
      } else {
        const vault = this.#store.getState().vault;
        if (!vault.isUnlocked()) {
          promise = Promise.reject('ERR_PLUGIN_LOCKED');
        } else {
          promise = Promise.resolve(this.accessControl(origin, details.level))
            .then((acc) =>
              acc
                ? Promise.resolve(this.#store.getState())
                : Promise.reject('ERR_NO_PERMISSION')
            )
            .then((state) =>
              state[details.executor[0]][details.executor[1]](...params)
            );
        }
      }
      return promise;
    };

    return Promise.resolve(getRequestDetails(method)).then(
      requestHandler.bind(this)
    );
  }
}
