const axios = require('axios');

class MiQ {
  constructor() {
    this.format = {
      text: '',
      avatar: null,
      username: '',
      display_name: '',
      color: false,
      watermark: ''
    };
  }

  setText(text) {
    this.format.text = text;
    return this;
  }

  setAvatar(avatar) {
    this.format.avatar = avatar;
    return this;
  }

  setUsername(username) {
    this.format.username = username;
    return this;
  }

  setDisplayname(display_name) {
    this.format.display_name = display_name;
    return this;
  }

  setColor(color = false) {
    this.format.color = color;
    return this;
  }

  setWatermark(watermark) {
    this.format.watermark = watermark;
    return this;
  }

  async generateBeta() {
    if (!this.format.text) {
      throw new Error('Text is required');
    }

    const API_URL = "https://miq-yol8.onrender.com/";

    try {
      const response = await axios.post(API_URL, this.format, { responseType: 'arraybuffer' });
      return Buffer.from(response.data);
    } catch (error) {
      if (error.response) {
        throw new Error(`Failed to generate quote: ${error.message}, Status: ${error.response.status}, Data: ${JSON.stringify(error.response.data)}`);
      } else if (error.request) {
        throw new Error(`Failed to generate quote: No response received, ${error.message}`);
      } else {
        throw new Error(`Failed to generate quote: ${error.message}`);
      }
    }
  }
}

module.exports = { MiQ };
