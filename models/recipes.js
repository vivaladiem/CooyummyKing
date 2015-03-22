module.exports = function(sequelize, DataTypes) {
	return sequelize.define('recipes', {
		id: {
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true,
			autoIncremet: true
		},

		title: {
			type: DataTypes.STRING,
			allowNull: false
		},

		description: {
			type: DataTypes.STRING,
			allowNull: true
		},

		main_image_num: {
			type: DataTypes.INTEGER(2)
		},

		image_path: {
			type: DataTypes.STRING
		},

		text_path: {
			type: DataTypes.STRING
		},

		like_count: {
			type: DataTypes.INTEGER,
			defaultValue: 0
		},

		scrap_count: {
			type: DataTypes.INTEGER,
			defaultValue: 0
		},

		cooking_time: {
			type: DataTypes.INTEGER(3)
		}
	}, {
		freezeTableName: true,
		tableName: 'recipes'
	});
}
