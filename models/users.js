var crypto = require('crypto');

var encryptPassword = function(password) {
	return crypto.createHmac('sha1', 'm_go').update(password).digest('hex');
};

module.exports = function(sequelize, DataTypes) {
	return sequelize.define('users', {
		id: {
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true,
			autoIncrement: true
		},

		email: {
			type: DataTypes.STRING,
			allowNull: true,
			unique: true
		},

		password: {
			type: DataTypes.STRING,
			allowNull: true
		},

		token: {
			type: DataTypes.STRING,
			allowNull: true
		},

		phone: {
			type: DataTypes.STRING,
			allowNull: true
		},

		username: {
			type: DataTypes.STRING,
			allowNull: false
		},

		profile_text: {
			type: DataTypes.TEXT,
			allowNull: true
		},

		/*
		profile_image_path: {
			type: DataTypes.STRING,
			allowNull: true
		},
		*/

		point: {
			type: DataTypes.INTEGER,
			allowNull: false,
			defaultValue: 0
		},

		level: {
			type: DataTypes.INTEGER(3),
			allowNull: false,
			defaultValue: 0
		},
	   /*
		ranking: {
			type: DataTypes.INTEGER,
			allowNull: false
		},
		*/

		recipe_count: {
			type: DataTypes.INTEGER(7),
			allowNull: false,
			defaultValue: 0
		},

		is_delete: {
			type: DataTypes.BOOLEAN,
			defaultValue: false
		}
	}, {
		freezeTableName: true,
		tableName: 'users',

		setterMethods: {
			password: function(password) {
				return this.setDataValue('password', encryptPassword(password));
			}
		},

		instanceMethods: {
			authenticate: function(plainText) {
				return encryptPassword(plainText) === this.password;
			}
		},
	})
};
