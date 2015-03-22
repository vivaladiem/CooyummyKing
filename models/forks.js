module.exports = function(sequelize, DataTypes) {
	return sequelize.define('forks', {
		id: {
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true,
			autoIncerment: true
		}
	}, {
		freezeTableName: true,
		tableName: 'forks'
	});
}
