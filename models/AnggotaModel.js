// AnggotaModel.js
class AnggotaModel {
  constructor(db) {
    this.db = db;
  }

  async getAll() {
    const rows = await this.db.query("SELECT * FROM anggota");
    return rows;
  }

  async getById(id) {
    const rows = await this.db.query("SELECT * FROM anggota WHERE id = ?", [
      id,
    ]);
    return rows[0];
  }

  async getByUsername(username) {
    const rows = await this.db.query("SELECT * FROM anggota WHERE UserID = ?", [
      username,
    ]);
    return rows[0];
  }

  async create(data) {
    const { nama, alamat, email } = data;
    const result = await this.db.query(
      "INSERT INTO anggota (nama, alamat, email) VALUES (?, ?, ?)",
      [nama, alamat, email]
    );
    return result.insertId;
  }

  async update(id, data) {
    const { nama, alamat, email } = data;
    await this.db.query(
      "UPDATE anggota SET nama = ?, alamat = ?, email = ? WHERE id = ?",
      [nama, alamat, email, id]
    );
    return true;
  }

  async delete(id) {
    await this.db.query("DELETE FROM anggota WHERE id = ?", [id]);
    return true;
  }
}

module.exports = AnggotaModel;
