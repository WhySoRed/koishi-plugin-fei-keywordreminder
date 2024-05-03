import { Context, Schema, Session, h } from 'koishi'
export const inject = ['database']

export const name = 'fei-keywordreminder'

export interface Config {}

export const Config: Schema<Config> = Schema.object({})

declare module 'koishi' {
    interface Tables {
        keywordRemind: KeywordRemind 
    }
}

export interface KeywordRemind {
    cid: string;
    uid: string;
    keyword: string;
    botId: string;
}

export function apply(ctx: Context) {

    ctx.model.extend('keywordRemind', {
        cid: "string",
        uid: "string",
        keyword: "string",
        botId: "string"
    },{
        primary: ['cid', 'uid', 'keyword', 'botId']
    })

    const cidKeywordList = {};

    ctx.on('ready', async() => {
        //通过集合来获取所有机器人实例的群列表
        const cidListSet = new Set<string>();
        await Promise.all(ctx.bots.map(async bot => {
            (await bot.getGuildList()).data.forEach(guild => {
                cidListSet.add(bot.platform + ':' + guild.id);
            });
        }));
        const cidListArr:Array<string> = Array.from(cidListSet)
        //通过获取到的群组列表，在cidKeywordList中按群id储存该群的关键词数组
        await Promise.all(cidListArr.map(async cid => {
            cidKeywordList[cid] = (await ctx.database.get('keywordRemind', { cid: cid })).map((data => data.keyword));;
        }));
        console.log(cidKeywordList);
        //从数据库中筛除已经无法获取的群提醒
        const needFilteredCidSet = new Set<string>();
        (await ctx.database.get('keywordRemind',{})).forEach(data => {needFilteredCidSet.add(data.cid)})
        const invaildCidList = Array.from(needFilteredCidSet).filter(cid => !cidListSet.has(cid));
        invaildCidList.forEach(async cid => {await ctx.database.remove('keywordRemind', {cid: cid})});

    })

    ctx.command('提醒').action(async ({ session }) => {
        return `施工中...`
    })

    ctx.command('提醒测试').action(async ({ session }) => {
        console.log(await session.bot.getGuildList())
    })

    ctx.command('提醒.群提醒').action(async ({ session }, message) => {
        if(message === undefined) return '请输入群提醒关键词' 
        try {
            await ctx.database.create('keywordRemind', {cid: session.cid, uid: session.userId, keyword: message, botId: session.bot.selfId})
            await session.bot.sendPrivateMessage(session.userId, `在群聊${session.event.channel.id}中，当有人发送了关键词"${message}"时，我会提醒你哦~`)
        }
        catch(err) {
            if (err.message.startsWith('Error with request send_private_msg'))
                return h.at(session.event.user.id) + ' 我没办法向你发送私聊提醒消息呀';
            else if(err.message.startsWith('UNIQUE constraint failed'))
                return `该关键词已存在...`;
            else throw(err); 
        }
        return `群提醒添加成功！`
    })

    ctx.command('提醒.全局提醒').action(async ({ session },message) => {
        if(message === undefined) return '请输入全局提醒关键词' 
        try {
            await session.bot.sendPrivateMessage(session.userId, `当有人发送了关键词"${message}"时，我会提醒你哦~`);
            //为每一个机器人和用户共同存在的群添加一个提醒
            (await session.bot.getGuildList()).data.forEach(async guild => {
                if ((await session.bot.getGuildMemberList(guild.id)).data.some(member => member.user.id === session.event.user.id)) {
                    await ctx.database.upsert('keywordRemind', [{cid: session.bot.platform + ':' + guild.id, uid: session.userId, keyword: message, botId: session.bot.selfId}]);
                    cidKeywordList[session.bot.platform + ':' + guild.id].push(message);
                }
            });
        }
        catch(err) {
            if (err.message.startsWith('Error with request send_private_msg'))
                return h.at(session.event.user.id) + ' 我没办法向你发送私聊提醒消息呀';
            else throw(err); 
        }
        return `全局提醒添加成功！`
    })

    ctx.command('提醒.列表').action(async ({ session }) => {

    })

    ctx.command('提醒.删除').action(async ({ session }) => {

    })

    ctx.on('message', async (session) => {
    
    })
}