const nextId = require("./next-id");

class Contact {
  constructor(first, last, phone) {
    this.id = nextId();
    this.firstName = first;
    this.lastName = last;
    this.phoneNumber = phone;
  }
  edit(first, last, phone) {
    this.firstName = first;
    this.lastName = last;
    this.phoneNumber = phone;
  }
  static makeContact(rawContact) {
    return Object.assign(new Contact(), rawContact);
  }

}
module.exports = Contact;
