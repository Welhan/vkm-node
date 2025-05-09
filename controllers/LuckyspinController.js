const express = require("express");
const helpers = require("../helpers/helpers");
const dotenv = require("dotenv");
const axios = require("axios");
const { db } = require("../configs/db");
const querystring = require("querystring");
const { constants } = require("../configs/constants");

dotenv.config();
let Loyalties = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
function formatDate(date, dateTime = true, delimiter = true) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");

  if (dateTime) {
    if (delimiter) {
      return `${year}-${month}-${day} ${hours}:{%  %}inutes}:${seconds}`;
    } else {
      return `${year}${month}${day}${hours}${minutes}${seconds}`;
    }
  } else {
    return `${year}-${month}-${day}`;
  }
}

module.exports = {
  luckySpinPrize: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/login");
    }
    let Username = req.session.Username;
    let akses = await helpers.checkUserAccess(Username, 2, 2);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(Username);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, Username);
        return item;
      })
    );

    return res.render("luckyspin/luckySpinPrize", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      websiteID: process.env.websiteID,
      csrfToken: req.csrfToken(),
      open: 2,
      active: 2,
      constants,
    });
  },
  luckySpinCoupon: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/login");
    }
    let Username = req.session.Username;
    let akses = await helpers.checkUserAccess(Username, 2, 3);
    if (!akses) return res.redirect("/");
    let menu = await helpers.generateMenu(Username);
    menu = await Promise.all(
      menu.map(async (item) => {
        item.submenu = await helpers.generateSubmenu(item.ID, Username);
        return item;
      })
    );

    return res.render("luckyspin/luckySpinCoupon", {
      successMessage: req.flash("success"),
      errorMessage: req.flash("error"),
      session: req.session,
      menu,
      websiteID: process.env.websiteID,
      csrfToken: req.csrfToken(),
      open: 2,
      active: 3,
      constants,
    });
  },
  getDataPrize: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/login");
    }
    let Loyalty = req.body.Loyalty ? req.body.Loyalty : "Bronze";
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT * FROM mst_luckyspin_prize WHERE Loyalty = ? AND WebsiteID = ?`,
        [Loyalty, process.env.websiteID]
      )
    ).results;
    res.render(
      "luckyspin/dataTable/luckyspinPrize",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        data: getData,
      },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
          thisMax: getData.length >= 12 ? "true" : "false",
        });
      }
    );
  },
  getAddPrize: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let Loyalties = ["Bronze", "Silver", "Gold", "Platinum", "Diamond"];
    res.render(
      "luckyspin/modals/addPrize",
      { layout: false, csrfToken: req.csrfToken(), Loyalties },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  addPrize: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let Loyalty = req.body.Loyalty;
    let Type = req.body.Type;
    let Prize = req.body.Nominal ? req.body.Nominal : req.body.Barang;
    let Level = req.body.Level;
    let error = {};
    if (!Loyalty) {
      error.Loyalty = "Loyalty wajib dipilih";
    }
    if (!Prize) {
      error.Prize = "Prize wajib diisi";
    }
    if (!Type) {
      error.Type = "Type wajib dipilih";
    }
    if (!Level) {
      error.Level = "Level wajib dipilih";
    }
    if (Type == "Barang") {
      Prize = req.body.Barang;
    } else {
      Prize = parseFloat(req.body.Nominal);
      if (Prize < 0) {
        error.Prize = "Prize tidak bisa minus";
      }
    }
    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }
    if (Level == "BasicPrize" || Level == "GrandPrize") {
      let getLoyalty = (
        await helpers.doQuery(
          db,
          `SELECT * FROM mst_luckyspin_prize WHERE Loyalty = ? AND PrizeLevel = ? AND WebsiteID = ?`,
          [Loyalty, Level, process.env.websiteID]
        )
      ).results;
      if (getLoyalty.length > 0) {
        let error = {};
        error.Level = Level + ` maksimum 1`;
        if (Object.keys(error).length > 0) {
          return res.json({ error: error });
        }
      } else {
        db.query(
          `INSERT INTO mst_luckyspin_prize (Loyalty, Jenis, PrizeLevel, Prize, WebsiteID, LastDate) VALUES (?, ?, ?, ?, ?, NOW())`,
          [Loyalty, Type, Level, Prize, process.env.websiteID],
          function (err) {
            if (err) {
              req.flash("error", `Gagal menambahkan prize loyalty ${Loyalty}`);
              return res.status(200).json({ status: false });
            }
            req.flash(
              "success",
              `Berhasil menambahkan prize loyalty ${Loyalty}`
            );
            return res.status(200).json({ status: true });
          }
        );
      }
    } else {
      db.query(
        `INSERT INTO mst_luckyspin_prize (Loyalty, Jenis, PrizeLevel, Prize, WebsiteID, LastDate) VALUES (?, ?, ?, ?, ?, NOW())`,
        [Loyalty, Type, Level, Prize, process.env.websiteID],
        function (err) {
          if (err) {
            req.flash("error", `Gagal menambahkan prize loyalty ${Loyalty}`);
            return res.status(200).json({ status: false });
          }
          req.flash("success", `Berhasil menambahkan prize loyalty ${Loyalty}`);
          return res.status(200).json({ status: true });
        }
      );
    }
  },
  getUpdatePrize: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let ID = req.body.ID;
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT * FROM mst_luckyspin_prize WHERE ID = ?`,
        [ID]
      )
    ).results[0];
    res.render(
      "luckyspin/modals/updatePrize",
      { layout: false, csrfToken: req.csrfToken(), data: getData },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  updatePrize: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let ID = req.body.ID;
    let Loyalty = req.body.Loyalty;
    let Type = req.body.Type;
    let Prize = req.body.Nominal ? req.body.Nominal : req.body.Barang;
    let Level = req.body.Level;
    let error = {};
    if (!Loyalty) {
      error.Loyalty = "Loyalty wajib dipilih";
    }
    if (!Prize) {
      error.Prize = "Prize wajib diisi";
    }
    if (!Type) {
      error.Type = "Type wajib dipilih";
    }
    if (!Level) {
      error.Level = "Level wajib dipilih";
    }

    if (Type == "Barang") {
      Prize = req.body.Barang;
    } else {
      Prize = parseFloat(req.body.Nominal);
      if (Prize < 0) {
        error.Prize = "Prize tidak bisa minus";
      }
    }
    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }
    if (Level == "BasicPrize" || Level == "GrandPrize") {
      let getLoyalty = (
        await helpers.doQuery(
          db,
          `SELECT * FROM mst_luckyspin_prize WHERE Loyalty = ? AND PrizeLevel = ? AND WebsiteID = ?`,
          [Loyalty, Level, process.env.websiteID]
        )
      ).results;
      if (getLoyalty.length > 0) {
        if (getLoyalty[0].ID != ID) {
          let error = {};
          error.Level = Level + ` maksimum 1`;
          if (Object.keys(error).length > 0) {
            return res.json({ error: error });
          }
        } else {
          db.query(
            `UPDATE mst_luckyspin_prize SET Loyalty = ?, Jenis = ?, PrizeLevel = ?, Prize = ? WHERE ID = ?`,
            [Loyalty, Type, Level, Prize, ID],
            function (err) {
              if (err) {
                req.flash("error", `Gagal update prize loyalty ${Loyalty}`);
                return res.status(200).json({ status: false });
              }
              req.flash("success", `Berhasil update prize loyalty ${Loyalty}`);
              return res.status(200).json({ status: true });
            }
          );
        }
      } else {
        db.query(
          `UPDATE mst_luckyspin_prize SET Loyalty = ?, Jenis = ?, PrizeLevel = ?, Prize = ? WHERE ID = ?`,
          [Loyalty, Type, Level, Prize, ID],
          function (err) {
            if (err) {
              req.flash("error", `Gagal update prize loyalty ${Loyalty}`);
              return res.status(200).json({ status: false });
            }
            req.flash("success", `Berhasil update prize loyalty ${Loyalty}`);
            return res.status(200).json({ status: true });
          }
        );
      }
    } else {
      db.query(
        `UPDATE mst_luckyspin_prize SET Loyalty = ?, Jenis = ?, PrizeLevel = ?, Prize = ? WHERE ID = ?`,
        [Loyalty, Type, Level, Prize, ID],
        function (err) {
          if (err) {
            req.flash("error", `Gagal update prize loyalty ${Loyalty}`);
            return res.status(200).json({ status: false });
          }
          req.flash("success", `Berhasil update prize loyalty ${Loyalty}`);
          return res.status(200).json({ status: true });
        }
      );
    }
  },
  getDeletePrize: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let ID = req.body.ID;
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT * FROM mst_luckyspin_prize WHERE ID = ?`,
        [ID]
      )
    ).results[0];
    res.render(
      "luckyspin/modals/deletePrize",
      { layout: false, csrfToken: req.csrfToken(), data: getData },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  deletePrize: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let ID = req.body.ID;
    let Loyalty = req.body.Loyalty;
    db.query(
      `DELETE FROM mst_luckyspin_prize WHERE ID = ?`,
      [ID],
      function (err) {
        if (err) {
          req.flash("error", `Gagal hapus prize loyalty ${Loyalty}`);
          return res.status(200).json({ status: false });
        }
        req.flash("success", `Berhasil hapus prize loyalty ${Loyalty}`);
        return res.status(200).json({ status: true });
      }
    );
  },

  getDataCoupon: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/login");
    }
    let value = [];
    let startDate = req.body.startDate;
    let endDate = req.body.endDate;
    let loyalty = req.body.loyalty;
    let username = req.body.username;
    let userFilter = "";
    let loyaltyFilter = "";
    let dateFilter = "";
    value.push(process.env.websiteID);
    if (username) {
      userFilter = ` AND A.Username LIKE ?`;
      value.push(`%${username}%`);
    }
    if (loyalty) {
      loyaltyFilter = ` AND A.Loyalty = ?`;
      value.push(`${loyalty}`);
    }

    if (startDate && endDate) {
      startDate = startDate.split("-").reverse().join("-");
      endDate = endDate.split("-").reverse().join("-");
      dateFilter += ` AND DATE(A.CreatedDate) BETWEEN ? AND ?`;
      value.push(startDate, endDate);
    } else if (startDate) {
      startDate = startDate.split("-").reverse().join("-");
      dateFilter += ` AND DATE(A.CreatedDate) = ?`;
      value.push(startDate);
    } else if (endDate) {
      endDate = endDate.split("-").reverse().join("-");
      dateFilter += ` AND DATE(A.CreatedDate) = ?`;
      value.push(endDate);
    }
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT A.Username, A.ID, B.Prize,A.Loyalty, B.UsedF, CASE 
        WHEN B.ExpiredDate < CURRENT_DATE THEN 1
        ELSE 0
        END AS IsExpired, CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM mst_token_detail B2 
            WHERE B2.TokenID = A.ID AND B2.UsedF = 1
        ) THEN 'Sedang Digunakan'
        ELSE ''
        END AS StatusPenggunaan FROM mst_token_header A
        LEFT JOIN mst_token_detail B ON A.ID = B.TokenID
        WHERE A.WebsiteID = ? ${userFilter} ${loyaltyFilter} ${dateFilter}
        GROUP BY A.ID ORDER BY A.ID DESC`,
        value
      )
    ).results;
    let count = {};
    console.log(getData);

    let countTotal = getData.length;
    let countUsed = await helpers.doQuery(
      db,
      `SELECT 
            B2.TokenID
        FROM 
            mst_token_detail B2
        WHERE 
            B2.ExpiredDate > CURRENT_DATE
        GROUP BY 
            B2.TokenID
        HAVING 
            MAX(CASE 
                WHEN B2.UsedF = 0 THEN 1 
                ELSE 0 
            END) = 1;`
    );
    count.TotalToken = countTotal;
    count.TotalUsed = countUsed.results.length;
    count.TotalUnUsed = 0;
    count.TotalSedangDigunakan = 0;
    count.TotalExpired = 0;
    res.render(
      "luckyspin/dataTable/luckyspinCoupon",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        data: getData,
        count,
      },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
          thisMax: getData.length >= 12 ? "true" : "false",
        });
      }
    );
  },
  getAddCoupon: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    res.render(
      "luckyspin/modals/addCoupon",
      { layout: false, csrfToken: req.csrfToken() },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  checkPlayer: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let suggestions = new Array();
    let Username = req.body.Username || "";
    let Loyalty = req.body.Loyalty || "";
    if (Username && Loyalty) {
      let queryPlayer = `SELECT Username FROM user WHERE Username = ?`;
      let valuePlayer = [Username];
      db.query(queryPlayer, valuePlayer, function (err, result) {
        if (err) {
          let data = {
            id: "",
            text: "",
          };
          suggestions.push(data);
        }
        if (result.length > 0) {
          let data = {
            id: Username,
            text: Username,
          };
          suggestions.push(data);
        } else {
          let data = {
            id: "",
            text: "",
          };
          suggestions.push(data);
        }
        return res.json(suggestions);
      });
    }
  },
  addCoupon: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let Username = req.body.Username;
    let Loyalty = req.body.Loyalty;
    let error = {};
    if (!Loyalty) {
      error.Loyalty = "Loyalty wajib dipilih";
    }
    if (!Username) {
      error.Username = "Username player wajib diisi";
    }
    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }
    db.query(
      `INSERT INTO mst_token_header (Username, Loyalty, WebsiteID, CreatedDate) VALUE (?, ?, ?, NOW())`,
      [Username, Loyalty, process.env.websiteID],
      function (err) {
        if (err) {
          req.flash("error", "Coupon gagal ditambahkan!");
          return res.status(202).json({ status: false });
        }
        req.flash("success", "Coupon berhasil ditambahkan!");
        return res.status(200).json({ status: true });
      }
    );
  },
  getSetCoupon: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let ID = req.body.ID;
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT ID AS TokenID, Username, Loyalty FROM mst_token_header WHERE ID = ?`,
        [ID]
      )
    ).results[0];
    let range = 3;
    let ExpRange = (
      await helpers.doQuery(
        db,
        `SELECT * FROM systab WHERE Config = 'ExpiredCouponLS'`
      )
    ).results;
    if (ExpRange.length > 0) {
      range = parseInt(ExpRange[0].Value);
    }
    let ExpiredDate = new Date();
    ExpiredDate.setDate(ExpiredDate.getDate() + range);
    ExpiredDate = ExpiredDate.toISOString().split("T")[0];
    let [year, month, day] = ExpiredDate.split("-");
    ExpiredDate = `${day}-${month}-${year}`;
    res.render(
      "luckyspin/modals/setCoupon",
      { layout: false, csrfToken: req.csrfToken(), data: getData, ExpiredDate },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  setCoupon: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let TokenID = req.body.TokenID;
    let Loyalty = req.body.Loyalty;
    let Username = req.body.Username;
    let PrizeBronze = req.body.PrizeBronze ? req.body.PrizeBronze : null;
    let PrizeSilver = req.body.PrizeSilver ? req.body.PrizeSilver : null;
    let PrizeGold = req.body.PrizeGold ? req.body.PrizeGold : null;
    let PrizePlatinum = req.body.PrizePlatinum ? req.body.PrizePlatinum : null;
    let PrizeDiamond = req.body.PrizeDiamond ? req.body.PrizeDiamond : null;

    let range = 3;
    let ExpRange = (
      await helpers.doQuery(
        db,
        `SELECT * FROM systab WHERE Config = 'ExpiredCouponLS'`
      )
    ).results;
    if (ExpRange.length > 0) {
      range = parseInt(ExpRange[0].Value);
    }
    let ExpiredDate = new Date();
    ExpiredDate.setDate(ExpiredDate.getDate() + range);
    ExpiredDate = ExpiredDate.toISOString().split("T")[0];
    let error = {};
    if (!Loyalty) {
      error.Loyalty = "Loyalty wajib diisi";
    }
    if (!Username) {
      error.Username = "Username wajib diisi";
    }
    if (!ExpiredDate) {
      error.ExpiredDate = "Expired Date wajib diisi";
    }
    // if (!PrizeBronze) {
    //   error.PrizeBronze = "Prize Bronze wajib diisi";
    // } else if (PrizeBronze.includes("Free Spin")) {
    //   if (!PrizeSilver) {
    //     error.PrizeSilver = "Prize Silver wajib diisi";
    //   } else if (PrizeSilver.includes("Free Spin")) {
    //     if (!PrizeGold) {
    //       error.PrizeGold = "Prize Gold wajib diisi";
    //     } else if (PrizeGold.includes("Free Spin")) {
    //       if (!PrizePlatinum) {
    //         error.PrizePlatinum = "Prize Platinum wajib diisi";
    //       } else if (PrizePlatinum.includes("Free Spin")) {
    //         if (!PrizeDiamond) {
    //           error.PrizeDiamond = "Prize Diamond wajib diisi";
    //         }
    //       }
    //     }
    //   }
    // }
    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }
    let Prizes = [
      PrizeBronze,
      PrizeSilver,
      PrizeGold,
      PrizePlatinum,
      PrizeDiamond,
    ];
    await new Promise((resolveQuery, rejectQuery) => {
      for (let i = 0; i < Loyalties.length; i++) {
        if (Prizes[i] != null) {
          let Loyalty = Loyalties[i];
          let Prize = Prizes[i];
          db.query(
            `INSERT INTO mst_token_detail (TokenID, Loyalty, Prize, UsedF, ExpiredDate, WebsiteID)
                VALUE (?, ?, ?, 0, ?, ?)`,
            [
              TokenID,
              Loyalty,
              Prize,
              `${ExpiredDate} 23:59:59`,
              process.env.websiteID,
            ],
            function (err) {
              if (err) {
                console.log(err);
                req.flash("error", `Gagal set coupon player ${Username}`);
                rejectQuery(err);
              } else {
                req.flash("success", `Berhasil set coupon player ${Username}`);
                resolveQuery();
              }
            }
          );
        }
      }
      res.status(200).json({ status: true });
    });
  },
  getUpdateCoupon: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let ID = req.body.ID;
    let headerData = (
      await helpers.doQuery(
        db,
        `SELECT ID, Username, Loyalty FROM mst_token_header WHERE ID = ?`,
        [ID]
      )
    ).results[0];
    let detailData = (
      await helpers.doQuery(
        db,
        `SELECT ExpiredDate FROM mst_token_detail WHERE TokenID = ? LIMIT 1`,
        [ID]
      )
    ).results[0];
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT A.ID AS TokenID, A.Username, A.Loyalty,B.Loyalty AS LoyaltyPrize, B.Prize FROM mst_token_header A
        LEFT JOIN mst_token_detail B ON A.ID = B.TokenID WHERE A.ID = ?`,
        [ID]
      )
    ).results;
    let ExpiredDate = detailData.ExpiredDate.toISOString().split("T")[0];
    let [year, month, day] = ExpiredDate.split("-");
    ExpiredDate = `${day}-${month}-${year}`;
    res.render(
      "luckyspin/modals/updateCoupon",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        data: getData,
        ID: headerData.ID,
        Username: headerData.Username,
        Loyalty: headerData.Loyalty,
        ExpiredDate,
        dataCoupon: getData,
      },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  updateCoupon: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let TokenID = req.body.TokenID;
    let Loyalty = req.body.Loyalty;
    let Username = req.body.Username;
    let PrizeBronze = req.body.PrizeBronze ? req.body.PrizeBronze : null;
    let PrizeSilver = req.body.PrizeSilver ? req.body.PrizeSilver : null;
    let PrizeGold = req.body.PrizeGold ? req.body.PrizeGold : null;
    let PrizePlatinum = req.body.PrizePlatinum ? req.body.PrizePlatinum : null;
    let PrizeDiamond = req.body.PrizeDiamond ? req.body.PrizeDiamond : null;
    let ExpiredDate = (
      await helpers.doQuery(
        db,
        `SELECT * FROM mst_token_detail WHERE TokenID = ? LIMIT 1`,
        [TokenID]
      )
    ).results[0].ExpiredDate;
    ExpiredDate = ExpiredDate.toISOString().split("T")[0];
    let error = {};
    if (!Loyalty) {
      error.Loyalty = "Loyalty wajib diisi";
    }
    if (!Username) {
      error.Username = "Username wajib diisi";
    }
    if (Object.keys(error).length > 0) {
      return res.json({ error: error });
    }
    let Prizes = [
      PrizeBronze,
      PrizeSilver,
      PrizeGold,
      PrizePlatinum,
      PrizeDiamond,
    ];
    try {
      db.query(
        `DELETE FROM mst_token_detail WHERE TokenID = ?`,
        [TokenID],
        async function (err) {
          if (err) {
            return console.log(err);
          }
          await new Promise((resolveQuery, rejectQuery) => {
            for (let i = 0; i < Loyalties.length; i++) {
              if (Prizes[i] != null) {
                let Loyalty = Loyalties[i];
                let Prize = Prizes[i];
                db.query(
                  `INSERT INTO mst_token_detail (TokenID, Loyalty, Prize, UsedF, ExpiredDate, WebsiteID)
                  VALUE (?, ?, ?, 0, ?, ?)`,
                  [
                    TokenID,
                    Loyalty,
                    Prize,
                    `${ExpiredDate} 23:59:59`,
                    process.env.websiteID,
                  ],
                  function (err) {
                    if (err) {
                      console.log(err);
                      req.flash("error", `Gagal set coupon player ${Username}`);
                      rejectQuery(err);
                    } else {
                      req.flash(
                        "success",
                        `Berhasil set coupon player ${Username}`
                      );
                      resolveQuery();
                    }
                  }
                );
              }
            }
          });
        }
      );
      res.status(200).json({ status: true });
    } catch (err) {
      reject(err);
    }
  },
  getDeleteCoupon: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let ID = req.body.ID;
    let headerData = (
      await helpers.doQuery(
        db,
        `SELECT ID, Username, Loyalty FROM mst_token_header WHERE ID = ?`,
        [ID]
      )
    ).results[0];
    let detailData = (
      await helpers.doQuery(
        db,
        `SELECT ExpiredDate FROM mst_token_detail WHERE TokenID = ?`,
        [ID]
      )
    ).results[0];
    let getData = (
      await helpers.doQuery(
        db,
        `SELECT A.ID AS TokenID, A.Username, A.Loyalty,B.Loyalty AS LoyaltyPrize, B.Prize FROM mst_token_header A
        LEFT JOIN mst_token_detail B ON A.ID = B.TokenID WHERE A.ID = ?`,
        [ID]
      )
    ).results;
    let ExpiredDate = detailData
      ? detailData.ExpiredDate.toISOString().split("T")[0]
      : "";
    if (detailData) {
      let [year, month, day] = ExpiredDate.split("-");
      ExpiredDate = `${day}-${month}-${year}`;
    }
    res.render(
      "luckyspin/modals/deleteCoupon",
      {
        layout: false,
        csrfToken: req.csrfToken(),
        dataCoupon: getData,
        ExpiredDate,
        ID,
        Loyalty: headerData.Loyalty,
        Username: headerData.Username,
      },
      (err, html) => {
        if (err) {
          console.error("Error rendering template:", err);
        }
        return res.json({
          view: html,
        });
      }
    );
  },
  deleteCoupon: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let ID = req.body.ID;
    db.query(`DELETE FROM mst_token_header WHERE ID = ?`, [ID], function (err) {
      if (err) {
        req.flash("error", `Gagal hapus coupon`);
        return res.status(200).json({ status: false });
      }
      db.query(
        `DELETE FROM mst_token_detail WHERE TokenID = ?`,
        [ID],
        function (err) {
          if (err) {
            req.flash("error", `Gagal hapus coupon`);
            return res.status(200).json({ status: false });
          }
          req.flash("success", `Berhasil hapus coupon`);
          return res.status(200).json({ status: true });
        }
      );
    });
  },
  populatePrizes: async function (req, res) {
    if (!req.session.ID) {
      return res.redirect("/");
    }
    let Loyalty = req.body.Loyalty;
    let ID = req.body.ID;
    let getPrizes = (
      await helpers.doQuery(
        db,
        `SELECT * FROM mst_luckyspin_prize WHERE Loyalty = ? AND WebsiteID = ?`,
        [Loyalty, process.env.websiteID]
      )
    ).results;
    let detailData;
    if (ID) {
      detailData = (
        await helpers.doQuery(
          db,
          `SELECT Prize FROM mst_token_detail WHERE TokenID = ?`,
          [ID]
        )
      ).results;
      if (getPrizes.length > 0) {
        return res.status(200).json({ data: getPrizes, detail: detailData });
      } else {
        return res.status(200).json({ data: [] });
      }
    } else {
      if (getPrizes.length > 0) {
        return res.status(200).json({ data: getPrizes });
      } else {
        return res.status(200).json({ data: [] });
      }
    }
  },
};
