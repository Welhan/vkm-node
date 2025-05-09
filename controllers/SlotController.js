const express = require("express");
const axios = require("axios");
const helpers = require("../helpers/helpers");
const { constants } = require("../configs/constants");
const { db } = require("../configs/db");

module.exports = {
  index: async function (req, res) {
    return res.render("slot/index", {
      layout: false,
    });
  },
};
