# AskUI - What Can Be Said Can Be Solved

> [!IMPORTANT]
> **Maintenance mode.** This library is in maintenance mode and is no longer under
> active development — only critical bug and security fixes are applied. It will be
> **deprecated at the end of 2026**. For new projects and continued development, use
> the [AskUI Python SDK](https://github.com/askui/vision-agent).

**AskUI** allows you to automate the interaction with an application, multiple applications or even the entire operating system. 
You can use this to write end-to-end tests or automate any kind of application.

## Start

To use **AskUI** follow these steps:

### 0. Initialize AskUI with All Needed Dependencies

Answer the questions to set up **AskUI** when you run this command.

```
npx askui@latest init
```

### 1. Execute Your First Instruction

[Request an **Access Token** first.](https://docs.askui.com/docs/general/Getting%20Started/getting-started#access-token)

Then follow [our guide](https://docs.askui.com/docs/general/Getting%20Started/write-your-first-instruction#configuration) to run your first instruction: 

```
npm run askui
```

## Documentation

Visit our [documentation](https://docs.askui.com) for examples and a [full list of supported instructions](https://docs.askui.com/docs/api/API/table-of-contents).

### Notes

Important note for Linux users: Currently, Wayland is not supported.
You can read more in our [troubleshooting chapter](https://docs.askui.com/docs/general/Troubleshooting/linux#wayland).
If you want to use the AskUI library `libfuse2`` is needed ([libfuse2 installation](https://docs.askui.com/docs/general/Troubleshooting/linux#libfuse2)).

## Example

The following example shows the use of **AskUI** for testing a desktop application.

```typescript
it('should be able to add to liked songs', async () => {
    await aui.click().icon().withText('search').exec();
    await aui.typeIn('Bohemian Rhapsody').textfield().exec();
    await aui.pressKey('enter').exec();
    await aui.moveMouseTo().text().withText('Bohemian Rhapsody').below().text().withText('Songs').exec();
    await aui.mouseRightClick().exec();
    await aui.click().text().withText('Save to your Liked Songs').exec();
    await aui.click().text().withText('Liked Songs').exec();
    await aui.expect().text().withText('Bohemian Rhapsody').exists().exec();
});
```
