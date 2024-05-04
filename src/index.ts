import { group } from 'console'
import { Context, Schema, Session, h, $ } from 'koishi'
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
        await cidKeywordUpdate();
    })

    async function cidKeywordUpdate() {
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
        //从数据库中筛除已经无法获取的群提醒
        const needFilteredCidSet = new Set<string>();
        (await ctx.database.get('keywordRemind',{})).forEach(data => {needFilteredCidSet.add(data.cid)})
        const invaildCidList = Array.from(needFilteredCidSet).filter(cid => !cidListSet.has(cid));
        invaildCidList.forEach(async cid => {await ctx.database.remove('keywordRemind', {cid: cid})});
    }

    ctx.command('提醒').action(async ({ session }) => {
        return `施工中...`
    })

    ctx.command('提醒测试').action(async ({ session }) => {
        console.log(await session.bot.getGuildMemberList('415681705'))
    })

    ctx.command('提醒.群提醒','[关键词] [(可选)群id]').action(async ({ args, session }) => {
        if(args[0] === undefined) return '请输入群提醒关键词' 
        if(args[1] === undefined) {
            try {
                await ctx.database.create('keywordRemind', {cid: session.cid, uid: session.userId, keyword: args[0], botId: session.bot.selfId});
                await session.bot.sendPrivateMessage(session.userId, `在群聊${session.event.channel.id}中，当有人发送了关键词"${args[0]}"时，我会提醒你哦~`);
            }
            catch(err) {
                if (err.message.startsWith('Error with request send_private_msg'))
                    return h.at(session.event.user.id) + ' 我没办法向你发送私聊提醒消息呀';
                else if(err.message.startsWith('UNIQUE constraint failed'))
                    return `该关键词已存在...`;
                else throw(err); 
            }
        }
        else {
            if((await session.bot.getGuildList()).data.map( guild => guild.id).some(id => id === args[1]) &&
            (await session.bot.getGuildMemberList(args[1])).data.some(member => member.user.id === session.event.user.id)) {
                try {
                    await ctx.database.create('keywordRemind', {cid: session.bot.platform + ':' + args[1], uid: session.userId, keyword: args[0], botId: session.bot.selfId});
                    await session.bot.sendPrivateMessage(session.userId, `在群聊${args[1]}中，当有人发送了关键词"${args[0]}"时，我会提醒你哦~`);
                }
                catch(err) {
                    if (err.message.startsWith('Error with request send_private_msg'))
                        return h.at(session.event.user.id) + ' 我没办法向你发送私聊提醒消息呀';
                    else if(err.message.startsWith('UNIQUE constraint failed'))
                        return `该关键词已存在...`;
                    else throw(err); 
                }
            }
            else return `找不到该群或者我与您不同时在该群中...`
        }
        return `群提醒添加成功！`
    })

    ctx.command('提醒.全局提醒','[关键词]').action(async ({ session }, message) => {
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

    ctx.command('提醒.删除','[要删除的关键词] [(可选)群id]').action(async ({ args, session }) => {
        if(args[0] === undefined) return '请输入要删除的关键词'
        if(args[1] === undefined) {
            if((await ctx.database.get('keywordRemind', {keyword: args[0],})).length === 0) return `该关键词不存在...`;
            await ctx.database.remove('keywordRemind', {uid: session.userId, keyword: args[0], botId: session.bot.selfId});
            await cidKeywordUpdate();
        }
        else {
            if((await ctx.database.get('keywordRemind', {keyword: args[0], cid: session.bot.platform + ':' + args[1]})).length === 0) return `该关键词不存在...`;
            await ctx.database.remove('keywordRemind', {uid: session.userId, keyword: args[0], cid: session.bot.platform + ':' + args[1], botId: session.bot.selfId});
            await cidKeywordUpdate();
        }
        return `删除成功！`
    })

    ctx.command('提醒.列表').action(async ({ session }) => {
        const keywordCidList = {}
        const uid = session.userId;
        const botId = session.bot.selfId;
        //利用数据库的groupby方法，获得用户的{'keyword1':[cid1, cid2, ...], 'keyword2': [...] ...}的对象
        await Promise.all(
            (await ctx.database.select('keywordRemind')
            .where({uid, botId}).groupBy('keyword').execute())
                //把获取到的用户的keyword列表(格式为[{keyword: 'keyword1'}, {keyword: ...} ...])的keyword
                //获取每个keyword的cid数组填入keywordCidList
                .map(async data => {
                    keywordCidList[data.keyword] = 
                        (await ctx.database.get('keywordRemind', {uid, keyword: data.keyword, botId}))
                        .map(data => data.cid.replace(/^.*:/, ''))
                })
        );
        return '您的提醒词列表：\n' + Object.keys(keywordCidList).map(keyword => {return `关键词：'${keyword}' 群id：${keywordCidList[keyword].join(', ')}`}).join('\n');
    })


    ctx.on('message', async (session) => {
        //记得try
    })
}