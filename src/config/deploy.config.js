module.exports = {
    production: {
        host: process.env.DEPLOY_HOST,
        user: process.env.DEPLOY_USER,
        path: '/var/www/solbot',
        pm2_name: 'solbot',
        branch: 'main',
        pre_deploy: [
            'npm install',
            'npm run build'
        ],
        post_deploy: [
            'npm run migrate',
            'pm2 restart solbot'
        ]
    },
    staging: {
        host: process.env.STAGING_HOST,
        user: process.env.STAGING_USER,
        path: '/var/www/solbot-staging',
        pm2_name: 'solbot-staging',
        branch: 'develop',
        pre_deploy: [
            'npm install',
            'npm run build'
        ],
        post_deploy: [
            'npm run migrate',
            'pm2 restart solbot-staging'
        ]
    }
}; 