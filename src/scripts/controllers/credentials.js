const InitState = {
  credentials: [],
};

export default class CredentialsController {
  #credentials;

  constructor(credentials = []) {
    this.#credentials = credentials;
  }

  serialize() {
    if (this.#credentials.length == 0) {
      return JSON.stringify([]);
    }
    return JSON.stringify(this.#credentials);
  }

  static deserialize(_credentials) {
    if (
      !_credentials ||
      (!Array.isArray(_credentials) && typeof _credentials != "string") ||
      _credentials.length == 0
    ) {
      return new CredentialsController();
    }
    let credentials = JSON.parse(_credentials);
    return new CredentialsController(credentials);
  }
  addCredentialSign(id, sig, verifySig) {
    return new Promise((resolve, reject) => {
      console.log("log id update", id);
      console.log("credentials", this.#credentials);
      const index = this.#credentials.findIndex((cred) => cred.id == id);
      console.log("index", this.#credentials[index]);
      if (index != -1) {
        console.log("EXISTs ", this.#credentials[index].id);

        this.#credentials[index].status = "active";
        this.#credentials[index].userData.sig = sig;
        this.#credentials[index].userData.verifySig = verifySig;
      } else {
        console.log("Does not exists", index);
        return reject(`Credential id  ${id}  doesn´t exists`);
      }
      return resolve();
    });
  }
  addCredential(id, credName, caName, photoURL, userData, status, ow, expDate) {
    return new Promise((resolve, reject) => {
      console.log("log id add", id);
      console.log("credentials", this.#credentials);
      const index = this.#credentials.findIndex((cred) => cred.id == id);
      console.log("index", index);
      if (index != -1 && ow) {
        console.log("ALREADY EXISTs w/ OW", index);
        this.#credentials.splice(index, 1);
      } else if (index != -1) {
        console.log("ALREADY EXISTs", index);
        return reject(`Credential id  ${id} already exists`);
      }
      this.#credentials.push({
        id,
        credName,
        caName,
        photoURL,
        userData,
        status,
        expDate,
      });

      return resolve();
    });
  }

  deleteCredential(idt) {
    return Promise.resolve(
      this.#credentials.findIndex((id) => id.idt == idt)
    ).then((index) => {
      if (index != -1) this.#credentials.splice(index, 1);
    });
  }

  get() {
    return this.#credentials;
  }

  getIDTsList() {
    return this.#credentials.map((id) => id.id);
  }
}
