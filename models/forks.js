module.exports = function(sequelize, DataTypes) {
	return sequelize.define('forks', {
		user_id: {
			type: DataTypes.INTEGER,
			unique: 'fork'
		},
		recipe_id: {
			type: DataTypes.INTEGER,
			unique: 'fork'
		}
	}, {
		freezeTableName: true,
		tableName: 'forks'
	});
}
